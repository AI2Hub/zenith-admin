import * as z from 'zod';
import { idParam, paginated } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { OPEN_APP_ENVIRONMENTS } from '../constants';
import { createDeveloperOAuth2ClientSchema, openApiDebugRequestSchema, updateDeveloperOAuth2ClientSchema } from '../validation';
import { oauth2ClientCreatedSchema, oauth2ClientListQuery, oauth2ClientSchema, oauth2ClientSecretSchema } from './oauth2-clients';

// ─── 实体 ────────────────────────────────────────────────────────────────────

const openAppQuotaUsageItemSchema = z.object({
  used: z.int(),
  limit: z.int().meta({ description: '0 = 不限' }),
  percentage: z.number().meta({ description: '已用百分比（0-100，不限时为 0）' }),
});

export type OpenAppQuotaUsageItem = z.infer<typeof openAppQuotaUsageItemSchema>;

/** 应用实时配额用量（QPS / 日 / 月） */
export const openAppQuotaUsageSchema = z.object({
  clientId: z.string(),
  environment: z.enum(OPEN_APP_ENVIRONMENTS),
  planCode: z.string().nullable(),
  planName: z.string().nullable(),
  qps: openAppQuotaUsageItemSchema,
  daily: openAppQuotaUsageItemSchema,
  monthly: openAppQuotaUsageItemSchema,
}).meta({ id: 'OpenAppQuotaUsage' });

export type OpenAppQuotaUsage = z.infer<typeof openAppQuotaUsageSchema>;

/** API 调试台一次调用的请求 / 签名 / 响应回放 */
export const openApiDebugResultSchema = z.object({
  requestUrl: z.string(),
  method: z.string(),
  requestHeaders: z.record(z.string(), z.string()),
  stringToSign: z.string().optional().meta({ description: 'HMAC 签名通道的待签名串；Bearer 通道无此字段' }),
  statusCode: z.int(),
  responseHeaders: z.record(z.string(), z.string()),
  responseBody: z.string().meta({ description: '响应体原文（最多 64KB）' }),
  durationMs: z.int(),
}).meta({ id: 'OpenApiDebugResult' });

export type OpenApiDebugResult = z.infer<typeof openApiDebugResultSchema>;

/** 可调试的开放 API 端点目录条目 */
export const openApiDebugEndpointSchema = z.object({
  method: z.string().meta({ example: 'GET' }),
  path: z.string().meta({ description: '完整路径，路径参数以 {name} 占位', example: '/api/open/v1/ping' }),
  summary: z.string(),
  scope: z.string().nullable().meta({ description: '所需 scope；null = 无需 scope' }),
}).meta({ id: 'OpenApiDebugEndpoint' });

export type OpenApiDebugEndpoint = z.infer<typeof openApiDebugEndpointSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const developerAppContract = defineContract('/api/developer-apps', {
  list: op.get('/', { access: 'authenticated', query: oauth2ClientListQuery, response: paginated(oauth2ClientSchema), summary: '获取我的开放平台应用' }),
  create: op.post('/', { access: 'authenticated', audit: { description: '创建开发者应用', recordResponseBody: false }, body: createDeveloperOAuth2ClientSchema, response: oauth2ClientCreatedSchema, summary: '创建我的开放平台应用' }),
  submit: op.post('/{id}/submit', { access: 'authenticated', audit: { description: '提交开发者应用审核', recordResponseBody: false }, params: idParam, response: oauth2ClientSchema, summary: '提交应用审核' }),
  regenerateSecret: op.post('/{id}/regenerate-secret', { access: 'authenticated', audit: { description: '轮换开发者应用密钥', recordResponseBody: false }, params: idParam, response: oauth2ClientSecretSchema, summary: '轮换我的应用密钥' }),
  quotaUsage: op.get('/{id}/quota-usage', { access: 'authenticated', params: idParam, response: openAppQuotaUsageSchema, summary: '获取应用实时配额用量' }),
  debugEndpoints: op.get('/debug/endpoints', { access: 'authenticated', response: z.array(openApiDebugEndpointSchema), summary: '获取可调试的开放 API 端点目录' }),
  debug: op.post('/{id}/debug', { access: 'authenticated', audit: { description: '在线调试开放 API', recordResponseBody: false }, params: idParam, body: openApiDebugRequestSchema, response: openApiDebugResultSchema, summary: '在线调试开放 API' }),
  detail: op.get('/{id}', { access: 'authenticated', params: idParam, response: oauth2ClientSchema, summary: '获取我的应用详情' }),
  update: op.put('/{id}', { access: 'authenticated', audit: { description: '更新开发者应用', recordResponseBody: false }, params: idParam, body: updateDeveloperOAuth2ClientSchema, response: oauth2ClientSchema, summary: '更新我的开放平台应用' }),
  remove: op.delete('/{id}', { access: 'authenticated', audit: { description: '删除开发者应用', recordResponseBody: false }, params: idParam, summary: '删除我的开放平台应用' }),
}, { auditModule: '开放平台-开发者中心', tags: ['DeveloperApps'] });
