import * as z from 'zod';
import { auditFieldsSchema, batchIdsBody, entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createApiScopeSchema, updateApiScopeSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** API Scope 注册表项 */
export const apiScopeSchema = z.object({
  id: z.int(),
  code: z.string().meta({ example: 'user:read' }),
  name: z.string(),
  description: z.string().nullable(),
  scopeGroup: z.string().meta({ example: 'user' }),
  status: entityStatusSchema,
  usedByAppCount: z.int().meta({ description: '引用该 scope 的应用数量，> 0 时不可删除' }),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ApiScope' });

export type ApiScope = z.infer<typeof apiScopeSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const apiScopeListQuery = paginationQuery.extend({
  keyword: keywordQuery('编码 / 名称'),
  scopeGroup: keywordQuery('权限组'),
  status: entityStatusQuery,
});

export const apiScopeContract = defineContract('/api/api-scopes', {
  list: op.get('/', { access: { permission: 'open:scope:view' }, query: apiScopeListQuery, response: paginated(apiScopeSchema), summary: '获取 API Scope 列表' }),
  options: op.get('/options', { access: 'authenticated', response: z.array(apiScopeSchema), summary: '获取全部启用的 Scope（供应用配置下拉）' }),
  detail: op.get('/{id}', { access: { permission: 'open:scope:view' }, params: idParam, response: apiScopeSchema, summary: '获取 API Scope 详情' }),
  create: op.post('/', { access: { permission: 'open:scope:manage' }, audit: '创建 API Scope', body: createApiScopeSchema, response: apiScopeSchema, summary: '创建 API Scope' }),
  update: op.put('/{id}', { access: { permission: 'open:scope:manage' }, audit: '更新 API Scope', params: idParam, body: updateApiScopeSchema, response: apiScopeSchema, summary: '更新 API Scope' }),
  removeBatch: op.delete('/batch', { access: { permission: 'open:scope:manage' }, audit: '批量删除 API Scope', body: batchIdsBody, summary: '批量删除 API Scope' }),
  remove: op.delete('/{id}', { access: { permission: 'open:scope:manage' }, audit: '删除 API Scope', params: idParam, summary: '删除 API Scope' }),
}, { auditModule: '开放平台-API Scope', tags: ['ApiScopes'] });
