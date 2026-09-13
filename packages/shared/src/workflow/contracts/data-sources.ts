import * as z from 'zod';
import { auditFieldsSchema, entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWorkflowDataSourceSchema, updateWorkflowDataSourceSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 表单远程数据源（登记式外部接口，供 select 字段拉取选项） */
export const workflowDataSourceSchema = z.object({
  id: z.int(),
  name: z.string(),
  method: z.enum(['GET', 'POST']),
  url: z.string(),
  headers: z.record(z.string(), z.string()).nullable().optional().meta({ description: '附加请求头；返回时值统一脱敏为 ******，更新时传 ****** 表示沿用旧值' }),
  itemsPath: z.string().nullable().optional(),
  valueField: z.string(),
  labelField: z.string(),
  keywordParam: z.string().nullable().optional(),
  status: entityStatusSchema,
  remark: z.string().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WorkflowDataSource' });

export type WorkflowDataSource = z.infer<typeof workflowDataSourceSchema>;

/** 远程数据源返回的选项 */
export const workflowDataSourceOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
}).meta({ id: 'WorkflowDataSourceOption' });

export type WorkflowDataSourceOption = z.infer<typeof workflowDataSourceOptionSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const workflowDataSourceListQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  status: entityStatusQuery,
});

export const workflowDataSourceOptionsQuery = z.object({
  keyword: keywordQuery(),
});

export const workflowDataSourceRecordQuery = z.object({
  value: z.string().min(1).meta({ description: '选项值' }),
});

export const workflowDataSourceContract = defineContract('/api/workflows/data-sources', {
  list: op.get('/', { access: { permission: 'workflow:datasource:list' }, query: workflowDataSourceListQuery, response: paginated(workflowDataSourceSchema), summary: '数据源列表' }),
  options: op.get('/{id}/options', { access: 'authenticated', params: idParam, query: workflowDataSourceOptionsQuery, response: z.array(workflowDataSourceOptionSchema), summary: '拉取数据源选项' }),
  record: op.get('/{id}/record', {
    access: 'authenticated',
    params: idParam,
    query: workflowDataSourceRecordQuery,
    response: z.record(z.string(), z.unknown()).nullable(),
    summary: '按选项值取数据源完整记录',
    description: '联动赋值回填用；未命中返回 null',
  }),
  detail: op.get('/{id}', { access: { permission: 'workflow:datasource:list' }, params: idParam, response: workflowDataSourceSchema, summary: '数据源详情' }),
  create: op.post('/', { access: { permission: 'workflow:datasource:create' }, audit: '创建远程数据源', body: createWorkflowDataSourceSchema, response: workflowDataSourceSchema, summary: '创建数据源' }),
  update: op.put('/{id}', { access: { permission: 'workflow:datasource:update' }, audit: '更新远程数据源', params: idParam, body: updateWorkflowDataSourceSchema, response: workflowDataSourceSchema, summary: '更新数据源' }),
  remove: op.delete('/{id}', { access: { permission: 'workflow:datasource:delete' }, audit: '删除远程数据源', params: idParam, summary: '删除数据源' }),
}, { auditModule: '远程数据源', tags: ['远程数据源'] });
