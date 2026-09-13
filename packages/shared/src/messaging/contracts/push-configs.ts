import * as z from 'zod';
import { entityStatusQuery, entityStatusSchema, idParam, paginated, paginationQuery, queryEnum, keywordQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { PUSH_PROVIDERS } from '../constants';
import { createPushConfigSchema, testPushSendSchema, updatePushConfigSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** App 推送凭证（一对一挂应用）：列表脱敏 appKey 且不含 masterSecret；详情回传原文 appKey 与空 masterSecret（留空即不更新） */
export const pushConfigSchema = z.object({
  id: z.int(),
  appId: z.int(),
  appName: z.string().optional().meta({ description: '所属应用名称（JOIN 冗余）' }),
  name: z.string(),
  provider: z.enum(PUSH_PROVIDERS),
  appKey: z.string(),
  masterSecret: z.string().optional().meta({ description: '仅详情返回，恒为空串；编辑留空表示保持原值' }),
  apnsProduction: z.boolean().meta({ description: 'iOS APNs 环境：true=生产 false=开发' }),
  status: entityStatusSchema,
  remark: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'PushConfig' });

export type PushConfig = z.infer<typeof pushConfigSchema>;

export const pushTestSendResultSchema = z.object({
  msgId: z.string().nullable().meta({ description: '供应商消息 ID' }),
}).meta({ id: 'PushTestSendResult' });

export type PushTestSendResult = z.infer<typeof pushTestSendResultSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const pushConfigListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 备注', { max: 256 }),
  provider: queryEnum(PUSH_PROVIDERS),
  status: entityStatusQuery,
});

export const pushConfigContract = defineContract('/api/push-configs', {
  list: op.get('/', { access: { permission: 'system:push:list' }, query: pushConfigListQuery, response: paginated(pushConfigSchema), summary: '推送配置列表' }),
  detail: op.get('/{id}', { access: { permission: 'system:push:list' }, params: idParam, response: pushConfigSchema, summary: '推送配置详情（编辑回填，密钥不回传）' }),
  create: op.post('/', { access: { permission: 'system:push:create' }, audit: { description: '创建推送配置', recordBody: false }, body: createPushConfigSchema, response: pushConfigSchema, summary: '创建推送配置' }),
  update: op.put('/{id}', { access: { permission: 'system:push:update' }, audit: { description: '更新推送配置', recordBody: false }, params: idParam, body: updatePushConfigSchema, response: pushConfigSchema, summary: '更新推送配置' }),
  remove: op.delete('/{id}', { access: { permission: 'system:push:delete' }, audit: '删除推送配置', params: idParam, summary: '删除推送配置' }),
  testSend: op.post('/{id}/test', { access: { permission: 'system:push:send' }, audit: '测试推送', params: idParam, body: testPushSendSchema, response: pushTestSendResultSchema, summary: '测试发送（直发 RegistrationID）' }),
}, { auditModule: '推送管理', tags: ['推送管理'] });
