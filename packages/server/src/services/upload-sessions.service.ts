import { randomUUID } from 'node:crypto';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { InitChunkUploadInput } from '@zenith/shared';
import { db } from '../db';
import { uploadSessions, uploadChunks, managedFiles, fileStorageConfigs } from '../db/schema';
import { buildUploadObjectKey, uploadObjectByConfig, extractBucketName } from '../lib/file-storage';
import { tenantCondition, getCreateTenantId } from '../lib/tenant';
import { currentUser } from '../lib/context';
import { assertUploadSizeAllowed, assertUploadTypeAllowed, mapManagedFile } from './files.service';

const UPLOAD_TEMP_ROOT = path.resolve(process.cwd(), 'storage/tmp/uploads');

function sessionTempDir(uploadId: string) {
  return path.join(UPLOAD_TEMP_ROOT, uploadId);
}

function chunkPath(uploadId: string, index: number) {
  return path.join(sessionTempDir(uploadId), String(index));
}

async function ensureSession(uploadId: string) {
  const user = currentUser();
  const tc = tenantCondition(uploadSessions, user);
  const where = tc ? and(eq(uploadSessions.uploadId, uploadId), tc) : eq(uploadSessions.uploadId, uploadId);
  const [session] = await db.select().from(uploadSessions).where(where).limit(1);
  if (!session) throw new HTTPException(404, { message: '上传会话不存在或已过期' });
  return session;
}

async function getReceivedIndices(sessionId: number): Promise<number[]> {
  const rows = await db
    .select({ index: uploadChunks.index })
    .from(uploadChunks)
    .where(eq(uploadChunks.uploadSessionId, sessionId))
    .orderBy(asc(uploadChunks.index));
  return rows.map((r) => r.index);
}

async function cleanupSession(uploadId: string) {
  await fs.rm(sessionTempDir(uploadId), { recursive: true, force: true });
}

export async function initChunkUpload(input: InitChunkUploadInput) {
  const user = currentUser();
  await assertUploadSizeAllowed(input.fileSize);

  const [defaultConfig] = await db
    .select()
    .from(fileStorageConfigs)
    .where(and(eq(fileStorageConfigs.isDefault, true), eq(fileStorageConfigs.status, 'enabled')))
    .limit(1);
  if (!defaultConfig) throw new HTTPException(400, { message: '当前没有可用的默认文件服务，请先在文件配置中启用并设置默认服务' });

  const { objectKey } = buildUploadObjectKey(input.fileName, defaultConfig.basePath);
  const totalChunks = Math.max(1, Math.ceil(input.fileSize / input.chunkSize));
  const uploadId = randomUUID();

  await db.insert(uploadSessions).values({
    uploadId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType ?? null,
    chunkSize: input.chunkSize,
    totalChunks,
    storageConfigId: defaultConfig.id,
    provider: defaultConfig.provider,
    objectKey,
    bucketName: extractBucketName(defaultConfig),
    tenantId: getCreateTenantId(user),
  });
  await fs.mkdir(sessionTempDir(uploadId), { recursive: true });

  return { uploadId, chunkSize: input.chunkSize, totalChunks, received: [] as number[] };
}

export async function uploadChunk(uploadId: string, index: number, chunk: File) {
  const session = await ensureSession(uploadId);
  if (session.status !== 'uploading') throw new HTTPException(400, { message: '上传会话已结束' });
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    throw new HTTPException(400, { message: '分片序号越界' });
  }

  // 流式写入临时分片文件，不整片进内存
  const dest = chunkPath(uploadId, index);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(chunk.stream() as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest));
  const size = (await fs.stat(dest)).size;

  // 幂等记录已收分片，唯一约束保证并发安全
  await db
    .insert(uploadChunks)
    .values({ uploadSessionId: session.id, index, size })
    .onConflictDoUpdate({ target: [uploadChunks.uploadSessionId, uploadChunks.index], set: { size } });

  const received = await getReceivedIndices(session.id);
  return { index, received };
}

export async function getUploadStatus(uploadId: string) {
  const session = await ensureSession(uploadId);
  const received = await getReceivedIndices(session.id);
  return { uploadId, status: session.status, chunkSize: session.chunkSize, totalChunks: session.totalChunks, received };
}

/** 按序拼接各分片临时文件为单一可读流，逐片流式读取（内存占用受单片大小限制） */
async function* mergedChunkStream(uploadId: string, totalChunks: number) {
  for (let i = 0; i < totalChunks; i++) {
    yield* createReadStream(chunkPath(uploadId, i));
  }
}

export async function completeChunkUpload(uploadId: string) {
  const user = currentUser();
  const session = await ensureSession(uploadId);
  if (session.status === 'completed') throw new HTTPException(400, { message: '上传已完成' });

  const received = await getReceivedIndices(session.id);
  if (received.length !== session.totalChunks) {
    throw new HTTPException(400, { message: `分片不完整：已接收 ${received.length}/${session.totalChunks}` });
  }

  // 真实类型校验：读取首片前 4100 字节
  const head = await fs.readFile(chunkPath(uploadId, 0));
  await assertUploadTypeAllowed(head.subarray(0, 4100), session.mimeType ?? '');

  const [config] = await db.select().from(fileStorageConfigs).where(eq(fileStorageConfigs.id, session.storageConfigId)).limit(1);
  if (!config) throw new HTTPException(400, { message: '存储配置不存在' });

  // 合并分片并流式上传到存储
  const mergedStream = Readable.from(mergedChunkStream(uploadId, session.totalChunks));
  await uploadObjectByConfig(config, {
    objectKey: session.objectKey,
    stream: mergedStream,
    size: session.fileSize,
    mimeType: session.mimeType ?? undefined,
  });

  const extension = path.extname(session.fileName).replace('.', '').toLowerCase() || null;
  const [created] = await db
    .insert(managedFiles)
    .values({
      storageConfigId: config.id,
      storageName: config.name,
      provider: config.provider,
      originalName: session.fileName,
      objectKey: session.objectKey,
      bucketName: session.bucketName,
      size: session.fileSize,
      mimeType: session.mimeType,
      extension,
      tenantId: getCreateTenantId(user),
    })
    .returning();

  await db.update(uploadSessions).set({ status: 'completed' }).where(eq(uploadSessions.id, session.id));
  await cleanupSession(uploadId);

  return mapManagedFile(created);
}

export async function abortChunkUpload(uploadId: string) {
  const session = await ensureSession(uploadId);
  await db.update(uploadSessions).set({ status: 'aborted' }).where(eq(uploadSessions.id, session.id));
  await cleanupSession(uploadId);
}
