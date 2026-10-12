import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { logLinesSchema, logTailQuery } from './log-lines';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const logFileSchema = z.object({
  name: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  isGzip: z.boolean(),
}).meta({ id: 'LogFile' });

export type LogFile = z.infer<typeof logFileSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const logFileNameParam = z.object({
  filename: z.string().meta({ description: '应用日志目录下的文件名', example: 'app.log' }),
});

export const logFileContentQuery = logTailQuery.extend({
  traceId: z.string().min(8).max(64).optional().meta({ description: '精确匹配日志顶层 reqId，不匹配正文中出现的链路 ID' }),
  locateTraceId: z.string().min(8).max(64).optional().meta({ description: '定位首条顶层 reqId 匹配的日志，返回其周围最多 N 条连续记录；未找到时返回末尾 N 行，优先于过滤条件' }),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const logFileContract = defineContract('/api/log-files', {
  list: op.get('/', { access: { permission: 'system:log:files' }, response: z.array(logFileSchema), summary: '日志文件列表' }),
  content: op.get('/{filename}/content', { access: { permission: 'system:log:files' }, params: logFileNameParam, query: logFileContentQuery, response: logLinesSchema, summary: '读取日志文件内容（末尾或链路定位窗口）' }),
  remove: op.delete('/{filename}', { access: { permission: 'system:log:files:delete' }, audit: '删除日志文件', params: logFileNameParam, summary: '删除日志文件' }),
  download: op.get('/{filename}/download', { access: { permission: 'system:log:files:download' }, params: logFileNameParam, kind: 'file', summary: '下载日志文件' }),
  tail: op.get('/{filename}/tail', { access: { permission: 'system:log:files' }, params: logFileNameParam, kind: 'sse', response: z.string(), summary: '日志实时跟踪（SSE，event: log）' }),
}, { auditModule: '日志文件', tags: ['LogFiles'] });
