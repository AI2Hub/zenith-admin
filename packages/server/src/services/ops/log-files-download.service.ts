/**
 * 日志文件的批量打包下载。
 *
 * 与网盘同一套口径：小批量直接流式返回 zip（点完即下）；文件数或总字节超过阈值时
 * 转任务中心异步打包，产物落到托管文件并通知下载。
 *
 * 日志目录位于**服务进程所在主机**的本地磁盘，因此打包任务声明 `affinity: 'node'`
 * （只能由提交任务的进程执行），与文件管理的压缩 / 解压同理由。
 */
import fsp from 'node:fs/promises';
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HTTPException } from 'hono/http-exception';
import { formatBytes } from '@zenith/shared/core';
import {
  LOG_SYNC_ZIP_MAX_BYTES,
  LOG_SYNC_ZIP_MAX_FILES,
  type LogFileBatchDownloadResult,
} from '@zenith/shared/ops';
import { currentUser } from '../../lib/context';
import logger from '../../lib/logger';
import { registerTaskHandler, submitAsyncTask, TaskCancelledError } from '../../lib/task-center';
import { buildZipStream, type ZipEntrySource } from '../../lib/zip';
import { saveGeneratedManagedFile } from '../files/files.service';
import { notify } from '../messaging/notification-outbox.service';
import { resolveLogPath, safeFilename } from './log-files.service';

export const LOG_BATCH_DOWNLOAD_TASK_TYPE = 'log-files-batch-download';

/** 打包条目：zip 内名称 + 本机绝对路径 + 字节数 */
export interface LogZipEntry {
  name: string;
  path: string;
  size: number;
}

/**
 * 逐个校验文件名（与单删同一套穿越防护）并读取实际大小。
 *
 * 已被日志轮转 / 外部清理掉的文件跳过而不是整体失败：轮转按天发生，
 * 用户选中后到提交前文件就可能消失，为此让整批下载失败没有意义。
 */
export async function collectLogZipEntries(filenames: string[]): Promise<{ entries: LogZipEntry[]; totalBytes: number }> {
  const entries: LogZipEntry[] = [];
  let totalBytes = 0;
  for (const filename of [...new Set(filenames)]) {
    const name = safeFilename(filename);
    if (!name) throw new HTTPException(400, { message: `无效的文件名：${filename}` });
    const filepath = resolveLogPath(name);
    if (!filepath) throw new HTTPException(404, { message: '文件不存在' });
    try {
      const stat = await fsp.stat(filepath);
      if (!stat.isFile()) continue;
      entries.push({ name, path: filepath, size: stat.size });
      totalBytes += stat.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { entries, totalBytes };
}

/**
 * 把日志条目打包为 zip 流。
 * 条目在 append 前先探一次存在性：打包途中的轮转/删除按跳过处理，不让整批失败。
 */
export async function buildLogZipStream(
  entries: readonly LogZipEntry[],
  options: { onEntry?: (written: number) => Promise<void> } = {},
): Promise<Readable> {
  const sources: ZipEntrySource[] = entries.map((entry) => ({
    name: entry.name,
    open: async () => {
      await fsp.access(entry.path);
      return createReadStream(entry.path);
    },
  }));
  return buildZipStream(sources, { skipEntryErrors: true, onEntry: options.onEntry });
}

/**
 * 批量下载：低于阈值直接流式返回 zip；否则提交任务中心异步打包。
 */
export async function batchDownloadLogFiles(filenames: string[]): Promise<
  | { mode: 'sync'; stream: ReadableStream; filename: string }
  | { mode: 'task'; result: LogFileBatchDownloadResult }
> {
  const { entries, totalBytes } = await collectLogZipEntries(filenames);
  if (entries.length === 0) throw new HTTPException(404, { message: '所选的日志文件都已不存在' });

  if (entries.length > LOG_SYNC_ZIP_MAX_FILES || totalBytes > LOG_SYNC_ZIP_MAX_BYTES) {
    const task = await submitAsyncTask({
      taskType: LOG_BATCH_DOWNLOAD_TASK_TYPE,
      title: `打包下载 ${entries.length} 个日志文件（${formatBytes(totalBytes)}）`,
      payload: { filenames: entries.map((entry) => entry.name) },
    });
    return { mode: 'task', result: { mode: 'task', taskId: task.id } };
  }

  const stream = await buildLogZipStream(entries);
  const filename = entries.length === 1 ? `${entries[0].name}.zip` : `logs_${Date.now()}.zip`;
  return { mode: 'sync', stream: Readable.toWeb(stream) as ReadableStream, filename };
}

/**
 * 产物在应用内的落地页。
 *
 * 站内信的 link 契约是「深链地址（站内路由，点击消息跳转）」，消费方直接 `navigate(link)`：
 * 传 `/api/files/:id/content` 会被当成路由跳转，落到前端 404；而且裸链接带不上 bearer 令牌，
 * 就算强行新窗口打开也是 401。托管文件的落地页是文件库，按文件名过滤直达（与 entity-relations
 * 的深链同一形式），用户在那里一行就是一个带鉴权的下载。
 */
export function managedFileDeepLink(filename: string): string {
  return `/system/files?keyword=${encodeURIComponent(filename)}`;
}

/** 打包完成通知：失败只记日志，不阻断已完成的打包结果 */
async function notifyLogZipReady(
  userId: number,
  tenantId: number | null,
  fileCount: number,
  bytes: number,
  link: string,
  dedupeKey: string,
): Promise<void> {
  try {
    await notify('ops.log_files.zip_ready', {
      recipients: [{ type: 'user', id: userId }],
      vars: { fileCount, sizeText: formatBytes(bytes) },
      tenantId,
      link,
      dedupeKey,
    });
  } catch (err) {
    logger.warn({ err, userId }, 'log-files: 打包完成通知失败');
  }
}

export function registerLogFileTaskHandlers(): void {
  registerTaskHandler({
    taskType: LOG_BATCH_DOWNLOAD_TASK_TYPE,
    title: '日志文件打包下载',
    module: '日志文件',
    description: '大批量日志文件异步打包为 zip，完成后通知下载',
    allowConcurrent: true,
    maxAttempts: 2,
    retryDelayMs: 5000,
    retentionDays: 7,
    // 日志目录在本机：只能由提交任务的进程打包
    affinity: 'node',
    async run(ctx) {
      const filenames = Array.isArray(ctx.payload.filenames) ? (ctx.payload.filenames as string[]) : [];
      if (filenames.length === 0) throw new Error('缺少打包入参');

      const { entries, totalBytes } = await collectLogZipEntries(filenames);
      if (entries.length === 0) throw new Error('所选的日志文件都已不存在');

      await ctx.progress({ processed: 0, total: entries.length, note: '开始打包' });
      const stream = await buildLogZipStream(entries, {
        onEntry: async (written) => {
          const { cancelRequested } = await ctx.progress({
            processed: written,
            total: entries.length,
            note: `已打包 ${written}/${entries.length}`,
          });
          if (cancelRequested) throw new TaskCancelledError('用户取消打包');
        },
      });

      const user = currentUser();
      const zipName = `logs_${Date.now()}.zip`;
      const directory = await mkdtemp(join(tmpdir(), 'zenith-logs-'));
      let file;
      try {
        const path = join(directory, 'logs.zip');
        await pipeline(stream, createWriteStream(path));
        file = await saveGeneratedManagedFile({
          buffer: await openAsBlob(path, { type: 'application/zip' }),
          filename: zipName,
          mimeType: 'application/zip',
          tenantId: user.tenantId ?? null,
          createdBy: user.userId,
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }

      // 任务产物保留取件用的 API 路径（任务详情的 JSON 会原样展示）；通知只发站内路由
      const downloadUrl = `/api/files/${file.id}/content`;
      await notifyLogZipReady(user.userId, user.tenantId ?? null, entries.length, totalBytes, managedFileDeepLink(zipName), `log-zip:${ctx.taskId}`);
      return { fileId: file.id, downloadUrl, fileCount: entries.length, bytes: file.size };
    },
  });
}
