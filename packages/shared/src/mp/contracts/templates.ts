import * as z from 'zod';
import { idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { batchSendMpTemplateSchema, sendMpTemplateSchema } from '../../messaging/validation';
import { MP_TEMPLATE_SEND_STATUSES } from '../constants';
import { mpAccountIdBody, setMpTemplateIndustrySchema } from '../validation';
import { mpAccountIdQuery, mpSyncResultSchema } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const mpMessageTemplateSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  templateId: z.string().meta({ description: '微信模板 ID' }),
  title: z.string(),
  content: z.string().nullable(),
  example: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpMessageTemplate' });

export type MpMessageTemplate = z.infer<typeof mpMessageTemplateSchema>;

export const mpTemplateSendLogSchema = z.object({
  id: z.int(),
  accountId: z.int(),
  templateId: z.string(),
  openid: z.string(),
  data: z.record(z.string(), z.unknown()).nullable().meta({ description: '模板变量' }),
  url: z.string().nullable(),
  status: z.enum(MP_TEMPLATE_SEND_STATUSES),
  errorMsg: z.string().nullable(),
  msgId: z.string().nullable(),
  createdAt: z.string(),
}).meta({ id: 'MpTemplateSendLog' });

export type MpTemplateSendLog = z.infer<typeof mpTemplateSendLogSchema>;

const industryClassSchema = z.object({ firstClass: z.string(), secondClass: z.string() });

export const mpTemplateIndustrySchema = z.object({
  primaryIndustry: industryClassSchema.nullable(),
  secondaryIndustry: industryClassSchema.nullable(),
}).meta({ id: 'MpTemplateIndustry' });

export type MpTemplateIndustry = z.infer<typeof mpTemplateIndustrySchema>;

export const mpBatchSendResultSchema = z.object({
  success: z.int(),
  failed: z.int(),
  total: z.int(),
}).meta({ id: 'MpBatchSendResult' });

export type MpBatchSendResult = z.infer<typeof mpBatchSendResultSchema>;

// ─── 查询参数 ────────────────────────────────────────────────────────────────

export const mpTemplateListQuery = paginationQuery.extend({
  ...mpAccountIdQuery.shape,
  keyword: keywordQuery('模板标题'),
});

export const mpTemplateSendLogListQuery = paginationQuery.extend({
  ...mpAccountIdQuery.shape,
  status: queryEnum(MP_TEMPLATE_SEND_STATUSES),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpTemplateContract = defineContract('/api/mp/templates', {
  logs: op.get('/logs', { access: { permission: 'mp:template:list' }, query: mpTemplateSendLogListQuery, response: paginated(mpTemplateSendLogSchema), summary: '发送记录' }),
  industry: op.get('/industry', { access: { permission: 'mp:template:list' }, query: mpAccountIdQuery, response: mpTemplateIndustrySchema, summary: '获取所属行业' }),
  setIndustry: op.put('/industry', { access: { permission: 'mp:template:sync' }, audit: '设置模板行业', body: setMpTemplateIndustrySchema, summary: '设置所属行业' }),
  batchSend: op.post('/batch-send', { access: { permission: 'mp:template:send' }, audit: '批量发送模板消息', body: batchSendMpTemplateSchema, response: mpBatchSendResultSchema, summary: '批量发送模板消息' }),
  list: op.get('/', { access: { permission: 'mp:template:list' }, query: mpTemplateListQuery, response: paginated(mpMessageTemplateSchema), summary: '模板列表' }),
  sync: op.post('/sync', { access: { permission: 'mp:template:sync' }, audit: '同步模板消息', body: mpAccountIdBody, response: mpSyncResultSchema, summary: '从微信同步模板' }),
  send: op.post('/send', { access: { permission: 'mp:template:send' }, audit: '发送模板消息', body: sendMpTemplateSchema, response: mpTemplateSendLogSchema, summary: '发送模板消息' }),
  remove: op.delete('/{id}', { access: { permission: 'mp:template:delete' }, audit: '删除模板', params: idParam, summary: '删除模板' }),
}, { auditModule: '公众号模板消息', tags: ['公众号模板消息'] });
