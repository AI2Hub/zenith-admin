import * as z from 'zod';
import { dateRangeQuery, idParam, idQuery, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createTerminalRecordingSchema, terminalRecordingEventSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const terminalRecordingSchema = z.object({
  id: z.int(),
  title: z.string(),
  userId: z.int(),
  username: z.string(),
  shell: z.string().nullable(),
  cols: z.int(),
  rows: z.int(),
  duration: z.number().meta({ description: '录屏时长（秒）' }),
  sizeBytes: z.int().meta({ description: 'events JSON 字节数' }),
  commandCount: z.int().meta({ description: '近似命令数（含回车的输入事件条数）' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'TerminalRecording' });

export type TerminalRecording = z.infer<typeof terminalRecordingSchema>;

export const terminalRecordingDetailSchema = terminalRecordingSchema.extend({
  events: z.array(terminalRecordingEventSchema),
}).meta({ id: 'TerminalRecordingDetail' });

export type TerminalRecordingDetail = z.infer<typeof terminalRecordingDetailSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const terminalRecordingListQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  operatorUserId: idQuery(),
  ...dateRangeQuery(),
});

export const terminalRecordingCleanQuery = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(180).meta({ description: '清除多少天之前的录屏' }),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const terminalRecordingContract = defineContract('/api/terminal-recordings', {
  list: op.get('/', { access: { permission: 'system:terminal:execute' }, query: terminalRecordingListQuery, response: paginated(terminalRecordingSchema), summary: '我的录屏列表' }),
  create: op.post('/', { access: { permission: 'system:terminal:execute' }, audit: { description: '保存终端录屏', recordBody: false }, body: createTerminalRecordingSchema, response: terminalRecordingSchema, summary: '保存录屏' }),
  clean: op.delete('/clean', { access: { permission: 'system:terminal:execute' }, audit: '清除终端录屏', query: terminalRecordingCleanQuery, summary: '清除录屏记录' }),
  asciinema: op.get('/{id}/asciinema', { access: { permission: 'system:terminal:execute' }, params: idParam, kind: 'file', summary: '导出 asciinema 录屏' }),
  detail: op.get('/{id}', { access: { permission: 'system:terminal:execute' }, params: idParam, response: terminalRecordingDetailSchema, summary: '获取录屏详情（含 events）' }),
  remove: op.delete('/{id}', { access: { permission: 'system:terminal:execute' }, audit: '删除终端录屏', params: idParam, summary: '删除录屏' }),
}, { auditModule: 'Web 终端', tags: ['TerminalRecordings'] });
