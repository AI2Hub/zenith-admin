import type { OutputOf, QueryOf } from '@zenith/shared/core';
import { logFileContract } from '@zenith/shared/ops';
import { contractKey, urlOf, useApiMutation, useApiQuery } from '@/lib/contract-query';
import { request } from '@/utils/request';

export type LogFileContentParams = NonNullable<QueryOf<typeof logFileContract.content>>;

export const logFileKeys = {
  lists: contractKey(logFileContract.list),
  list: () => contractKey(logFileContract.list),
  content: (filename: string | undefined, params: LogFileContentParams) =>
    contractKey(logFileContract.content, { params: { filename: filename ?? '' }, query: params }),
};

export function useLogFiles(enabled = true) {
  return useApiQuery(logFileContract.list, undefined, { enabled });
}

/** 日志内容随时在变，不复用 30s 内的缓存：每次挂载 / 切换都回源 */
export function useLogFileContent(filename: string | undefined, params: LogFileContentParams, enabled = true) {
  return useApiQuery(logFileContract.content, { params: { filename: filename ?? '' }, query: params }, {
    enabled: enabled && !!filename,
    staleTime: 0,
  });
}

export function useDeleteLogFile() {
  return useApiMutation(logFileContract.remove, {
    invalidate: (qc) => {
      void qc.invalidateQueries({ queryKey: logFileKeys.lists });
    },
  });
}

/**
 * 批量删除：面板内多选后一次提交；响应带实际删除个数，用于成功文案。
 *
 * 失效只打列表：契约资源前缀 `['log-files']` 同时覆盖 `content`，按它失效会连带回源
 * 正在查看的那个文件 —— 刚删掉必然 404，弹「文件不存在」。删除不改变其它文件的内容，
 * 只有列表需要刷新。原先的 `logFileKeys.all` 因此移除，避免再被当成域级失效用。
 */
export function useBatchDeleteLogFiles() {
  return useApiMutation(logFileContract.removeBatch, {
    invalidate: (qc) => {
      void qc.invalidateQueries({ queryKey: logFileKeys.lists });
    },
  });
}

export function logFileDownloadUrl(filename: string) {
  return urlOf(logFileContract.download, { params: { filename } });
}

// ─── 打包下载 ─────────────────────────────────────────────────────────────────

type LogBatchDownloadTask = OutputOf<typeof logFileContract.batchDownload>;

/**
 * 批量打包下载：小批量由服务端直接流式返回 zip（立即触发浏览器下载），
 * 超过阈值时返回任务 JSON（完成后经通知中心下载）。混合响应无法走 api()，
 * 用原始 fetch 按 content-type 分流。
 */
export async function batchDownloadLogFiles(filenames: string[]): Promise<{ mode: 'sync' } | LogBatchDownloadTask | null> {
  const res = await request.fetchRaw(urlOf(logFileContract.batchDownload), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames }),
  });
  if (!res) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await res.json() as { code: number; message: string; data: LogBatchDownloadTask | null };
    if (body.code !== 0) throw new Error(body.message || '打包失败');
    return body.data ?? { mode: 'task', taskId: null };
  }
  if (!res.ok) throw new Error('打包失败');
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : `logs_${Date.now()}.zip`;
  const { downloadBlob } = await import('@/utils/download');
  downloadBlob(blob, filename);
  return { mode: 'sync' };
}

/** SSE 实时跟踪地址（event: log；`request.fetchRaw` + `readSseStream` 消费） */
export function logFileTailUrl(filename: string) {
  return urlOf(logFileContract.tail, { params: { filename } });
}
