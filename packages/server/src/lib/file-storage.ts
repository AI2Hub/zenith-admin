import OSS from 'ali-oss';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import COS from 'cos-nodejs-sdk-v5';
import * as qiniu from 'qiniu';
import BosClient from '@baiducloud/sdk';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import SftpClient from 'ssh2-sftp-client';
import { randomUUID } from 'node:crypto';
import { promises as fs, createWriteStream, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { FileStorageConfigRow, ManagedFileRow } from '../db/schema';
import { formatDate } from './datetime';

// esdk-obs-nodejs 是 CJS 模块，运行时动态加载
type ObsClientConstructor = new (opts: Record<string, string>) => ObsClientType;
let _ObsClientClass: ObsClientConstructor | null = null;
async function getObsClientClass(): Promise<ObsClientConstructor> {
  if (!_ObsClientClass) {
    const mod = await import('esdk-obs-nodejs');
    _ObsClientClass = (mod.default ?? mod) as ObsClientConstructor;
  }
  return _ObsClientClass;
}

// esdk-obs-nodejs 缺少官方类型声明，定义最小接口
interface ObsClientType {
  putObject(params: Record<string, unknown>, cb: (err: unknown, result: unknown) => void): void;
  getObject(params: Record<string, unknown>, cb: (err: unknown, result: { Body?: { Content?: Buffer } }) => void): void;
  deleteObject(params: Record<string, unknown>, cb: (err: unknown) => void): void;
}

export const DEFAULT_LOCAL_STORAGE_ROOT = 'storage/local';

function trimSlash(value?: string | null) {
  return value?.replaceAll(/^\/+|\/+$/g, '') ?? '';
}

function buildObjectKey(originalName: string, basePath?: string | null) {
  const ext = path.extname(originalName).toLowerCase();
  const datePart = formatDate(new Date()).replaceAll('-', '/');
  const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  return [trimSlash(basePath), datePart, uniqueName].filter(Boolean).join('/');
}

function resolveLocalRoot(config: FileStorageConfigRow) {
  const configuredRoot = config.localRootPath?.trim() || DEFAULT_LOCAL_STORAGE_ROOT;
  return path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(process.cwd(), configuredRoot);
}

function createOssClient(config: FileStorageConfigRow) {
  if (!config.ossRegion || !config.ossEndpoint || !config.ossBucket || !config.ossAccessKeyId || !config.ossAccessKeySecret) {
    throw new Error('OSS 配置不完整');
  }
  return new OSS({
    region: config.ossRegion,
    endpoint: config.ossEndpoint,
    bucket: config.ossBucket,
    accessKeyId: config.ossAccessKeyId,
    accessKeySecret: config.ossAccessKeySecret,
  });
}

function createS3Client(config: FileStorageConfigRow) {
  if (!config.s3Region || !config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error('S3 配置不完整');
  }
  return new S3Client({
    region: config.s3Region,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
    forcePathStyle: config.s3ForcePathStyle ?? false,
  });
}

function createCosClient(config: FileStorageConfigRow) {
  if (!config.cosRegion || !config.cosBucket || !config.cosSecretId || !config.cosSecretKey) {
    throw new Error('腾讯云 COS 配置不完整');
  }
  return new COS({
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey,
  });
}

function createObsClient(config: FileStorageConfigRow): ObsClientType {
  if (!config.obsEndpoint || !config.obsBucket || !config.obsAccessKeyId || !config.obsSecretAccessKey) {
    throw new Error('华为云 OBS 配置不完整');
  }
  return new ObsClient({
    access_key_id: config.obsAccessKeyId,
    secret_access_key: config.obsSecretAccessKey,
    server: config.obsEndpoint,
  });
}

function createKodoUploader(config: FileStorageConfigRow) {
  if (!config.kodoAccessKey || !config.kodoSecretKey || !config.kodoBucket) {
    throw new Error('七牛云 Kodo 配置不完整');
  }
  const mac = new qiniu.auth.digest.Mac(config.kodoAccessKey, config.kodoSecretKey);
  const putPolicy = new qiniu.rs.PutPolicy({ scope: config.kodoBucket });
  const uploadToken = putPolicy.uploadToken(mac);
  const zone = config.kodoRegion
    ? (qiniu.zone as Record<string, unknown>)[config.kodoRegion] as qiniu.conf.Zone | undefined
    : undefined;
  const conf = new qiniu.conf.Config({ zone });
  return { uploadToken, formUploader: new qiniu.form_up.FormUploader(conf), mac, conf };
}

function createBosClient(config: FileStorageConfigRow) {
  if (!config.bosEndpoint || !config.bosBucket || !config.bosAccessKeyId || !config.bosSecretAccessKey) {
    throw new Error('百度云 BOS 配置不完整');
  }
  return new BosClient({
    endpoint: config.bosEndpoint,
    credentials: { ak: config.bosAccessKeyId, sk: config.bosSecretAccessKey },
  });
}

function createAzureBlobClient(config: FileStorageConfigRow) {
  if (!config.azureAccountName || !config.azureAccountKey || !config.azureContainerName) {
    throw new Error('Azure Blob 配置不完整');
  }
  const credential = new StorageSharedKeyCredential(config.azureAccountName, config.azureAccountKey);
  const url = config.azureEndpoint || `https://${config.azureAccountName}.blob.core.windows.net`;
  const service = new BlobServiceClient(url, credential);
  return service.getContainerClient(config.azureContainerName);
}

async function sftpOperation<T>(config: FileStorageConfigRow, fn: (client: SftpClient) => Promise<T>): Promise<T> {
  if (!config.sftpHost || !config.sftpUsername) {
    throw new Error('SFTP 配置不完整');
  }
  const client = new SftpClient();
  try {
    await client.connect({
      host: config.sftpHost,
      port: config.sftpPort ?? 22,
      username: config.sftpUsername,
      ...(config.sftpPrivateKey ? { privateKey: config.sftpPrivateKey } : { password: config.sftpPassword ?? '' }),
    });
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function buildManagedFileUrl(fileId: number) {
  return `/api/files/${fileId}/content`;
}

/** 将 Web API ReadableStream 转换为 Node.js Readable，绕过 DOM/Node 类型不兼容问题 */
function toNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(stream as unknown as Parameters<typeof Readable.fromWeb>[0]);
}

export async function uploadFileByConfig(config: FileStorageConfigRow, file: File) {
  const objectKey = buildObjectKey(file.name, config.basePath);
  const extension = path.extname(file.name).replace('.', '').toLowerCase() || undefined;
  const mimeType = file.type || undefined;
  const size = file.size;

  if (config.provider === 'local') {
    const rootPath = resolveLocalRoot(config);
    const targetPath = path.join(rootPath, ...objectKey.split('/'));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await pipeline(toNodeReadable(file.stream()), createWriteStream(targetPath));
  } else if (config.provider === 'oss') {
    const client = createOssClient(config);
    await client.putStream(objectKey, toNodeReadable(file.stream()), {
      contentLength: size,
      ...(mimeType ? { mime: mimeType } : {}),
    } as unknown as OSS.PutStreamOptions);
  } else if (config.provider === 's3') {
    const client = createS3Client(config);
    await client.send(new PutObjectCommand({
      Bucket: config.s3Bucket!,
      Key: objectKey,
      Body: toNodeReadable(file.stream()),
      ContentLength: size,
      ...(mimeType ? { ContentType: mimeType } : {}),
    }));
  } else if (config.provider === 'cos') {
    const cos = createCosClient(config);
    await new Promise<void>((resolve, reject) => {
      cos.putObject({
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: objectKey,
        Body: toNodeReadable(file.stream()),
        ContentLength: size,
        ...(mimeType ? { ContentType: mimeType } : {}),
      }, (err) => {
        if (err) reject(new Error(String(err.message ?? err)));
        else resolve();
      });
    });
  } else if (config.provider === 'obs') {
    const obs = createObsClient(config);
    const buffer = Buffer.from(await file.arrayBuffer());
    await new Promise<void>((resolve, reject) => {
      obs.putObject({ Bucket: config.obsBucket!, Key: objectKey, Body: buffer, ...(mimeType ? { ContentType: mimeType } : {}) }, (err) => {
        if (err) reject(new Error(String((err as { message?: string }).message ?? JSON.stringify(err))));
        else resolve();
      });
    });
  } else if (config.provider === 'kodo') {
    const { uploadToken, formUploader } = createKodoUploader(config);
    const buffer = Buffer.from(await file.arrayBuffer());
    await new Promise<void>((resolve, reject) => {
      formUploader.put(uploadToken, objectKey, buffer, new qiniu.form_up.PutExtra(), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } else if (config.provider === 'bos') {
    const bosClient = createBosClient(config);
    const buffer = Buffer.from(await file.arrayBuffer());
    await bosClient.putObjectFromString(config.bosBucket!, objectKey, buffer.toString('binary'), {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Length': size,
    });
  } else if (config.provider === 'azure') {
    const containerClient = createAzureBlobClient(config);
    const blockBlobClient = containerClient.getBlockBlobClient(objectKey);
    const buffer = Buffer.from(await file.arrayBuffer());
    await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType } });
  } else if (config.provider === 'sftp') {
    const buffer = Buffer.from(await file.arrayBuffer());
    const remotePath = [config.sftpRootPath?.replace(/\/+$/, ''), ...objectKey.split('/')].filter(Boolean).join('/');
    await sftpOperation(config, async (client) => {
      const remoteDir = remotePath.substring(0, remotePath.lastIndexOf('/'));
      if (remoteDir) await client.mkdir(remoteDir, true);
      await client.put(buffer, remotePath);
    });
  } else {
    throw new Error(`不支持的存储类型: ${config.provider}`);
  }

  return { objectKey, size, mimeType, extension };
}

export async function readStoredFile(file: ManagedFileRow, config: FileStorageConfigRow) {
  const contentType = file.mimeType ?? 'application/octet-stream';
  const fileName = file.originalName;

  if (config.provider === 'local') {
    const filePath = path.join(resolveLocalRoot(config), ...file.objectKey.split('/'));
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return { stream, contentType, fileName };
  }

  if (config.provider === 'oss') {
    const client = createOssClient(config);
    // ali-oss getStream 返回 Node.js Readable，直接转为 Web ReadableStream
    const { stream: nodeStream } = await client.getStream(file.objectKey);
    const stream = Readable.toWeb(nodeStream as import('node:stream').Readable) as ReadableStream<Uint8Array>;
    return { stream, contentType, fileName };
  }

  if (config.provider === 's3') {
    const client = createS3Client(config);
    const response = await client.send(new GetObjectCommand({
      Bucket: config.s3Bucket!,
      Key: file.objectKey,
    }));
    // AWS SDK v3 Body.transformToWebStream() 直接返回 Web ReadableStream
    const stream = response.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
    return { stream, contentType, fileName };
  }

  if (config.provider === 'cos') {
    // COS SDK 不提供原生流式 API，将 buffer 包装为 ReadableStream 以统一接口
    const cos = createCosClient(config);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      cos.getObject({
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: file.objectKey,
      }, (err, data) => {
        if (err) reject(new Error(String(err.message ?? err)));
        else resolve(Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body));
      });
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
    return { stream, contentType, fileName };
  }

  if (config.provider === 'obs') {
    const obs = createObsClient(config);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      obs.getObject({ Bucket: config.obsBucket!, Key: file.objectKey }, (err, result) => {
        if (err) reject(new Error(String((err as { message?: string }).message ?? JSON.stringify(err))));
        else {
          const body = result?.Body?.Content;
          resolve(body ? Buffer.from(body) : Buffer.alloc(0));
        }
      });
    });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(buffer)); controller.close(); } });
    return { stream, contentType, fileName };
  }

  if (config.provider === 'kodo') {
    const { mac, conf } = createKodoUploader(config);
    const domain = config.kodoEndpoint ?? '';
    const bucketManager = new qiniu.rs.BucketManager(mac, conf);
    const privateUrl = bucketManager.privateDownloadUrl(domain, file.objectKey, Math.floor(Date.now() / 1000) + 3600);
    const response = await fetch(privateUrl);
    const stream = response.body as ReadableStream<Uint8Array>;
    return { stream, contentType, fileName };
  }

  if (config.provider === 'bos') {
    const bosClient = createBosClient(config);
    const result = await bosClient.getObject(config.bosBucket!, file.objectKey);
    const buffer = Buffer.from((result as { body: string }).body, 'binary');
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(buffer)); controller.close(); } });
    return { stream, contentType, fileName };
  }

  if (config.provider === 'azure') {
    const containerClient = createAzureBlobClient(config);
    const blockBlobClient = containerClient.getBlockBlobClient(file.objectKey);
    const response = await blockBlobClient.download();
    const nodeStream = response.readableStreamBody as import('node:stream').Readable;
    const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return { stream, contentType, fileName };
  }

  if (config.provider === 'sftp') {
    const buffer = await sftpOperation(config, async (client) => {
      const remotePath = [config.sftpRootPath?.replace(/\/+$/, ''), ...file.objectKey.split('/')].filter(Boolean).join('/');
      return client.get(remotePath) as Promise<Buffer>;
    });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(buffer)); controller.close(); } });
    return { stream, contentType, fileName };
  }

  throw new Error(`不支持的存储类型: ${config.provider}`);
}

export async function deleteStoredFile(file: ManagedFileRow, config: FileStorageConfigRow) {
  if (config.provider === 'local') {
    const filePath = path.join(resolveLocalRoot(config), ...file.objectKey.split('/'));
    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }

  if (config.provider === 'oss') {
    const client = createOssClient(config);
    await client.delete(file.objectKey);
    return;
  }

  if (config.provider === 's3') {
    const client = createS3Client(config);
    await client.send(new DeleteObjectCommand({
      Bucket: config.s3Bucket!,
      Key: file.objectKey,
    }));
    return;
  }

  if (config.provider === 'cos') {
    const cos = createCosClient(config);
    await new Promise<void>((resolve, reject) => {
      cos.deleteObject({
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: file.objectKey,
      }, (err) => {
        if (err) reject(new Error(String(err.message ?? err)));
        else resolve();
      });
    });
    return;
  }

  if (config.provider === 'obs') {
    const obs = createObsClient(config);
    await new Promise<void>((resolve, reject) => {
      obs.deleteObject({ Bucket: config.obsBucket!, Key: file.objectKey }, (err) => {
        if (err) reject(new Error(String((err as { message?: string }).message ?? JSON.stringify(err))));
        else resolve();
      });
    });
    return;
  }

  if (config.provider === 'kodo') {
    const { mac, conf } = createKodoUploader(config);
    const bucketManager = new qiniu.rs.BucketManager(mac, conf);
    await new Promise<void>((resolve, reject) => {
      bucketManager.delete(config.kodoBucket!, file.objectKey, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return;
  }

  if (config.provider === 'bos') {
    const bosClient = createBosClient(config);
    await bosClient.deleteObject(config.bosBucket!, file.objectKey);
    return;
  }

  if (config.provider === 'azure') {
    const containerClient = createAzureBlobClient(config);
    await containerClient.deleteBlob(file.objectKey);
    return;
  }

  if (config.provider === 'sftp') {
    await sftpOperation(config, async (client) => {
      const remotePath = [config.sftpRootPath?.replace(/\/+$/, ''), ...file.objectKey.split('/')].filter(Boolean).join('/');
      await client.delete(remotePath, true);
    });
    return;
  }

  throw new Error(`不支持的存储类型: ${config.provider}`);
}
