import * as z from 'zod';
import { auditFieldsSchema, entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery, idQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWorkflowFormSchema, updateWorkflowFormSchema } from '../validation';
import { workflowFormSchemaShape } from './flow-data';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 表单库实体 */
export const workflowFormSchema = z.object({
  id: z.int(),
  name: z.string().meta({ example: '请假申请表' }),
  code: z.string().nullable(),
  description: z.string().nullable(),
  categoryId: z.int().nullable(),
  categoryName: z.string().nullable().optional(),
  schema: workflowFormSchemaShape.nullable(),
  status: entityStatusSchema,
  revision: z.int().meta({ description: '乐观锁版本号（每次更新 +1，更新时回传 expectedRevision 做并发冲突检测）' }),
  usageCount: z.int().optional().meta({ description: '被多少个流程定义引用（列表场景返回）' }),
  tenantId: z.int().nullable(),
  ...auditFieldsSchema,
  createdByName: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WorkflowForm' });

export type WorkflowForm = z.infer<typeof workflowFormSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const workflowFormListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 编码'),
  status: entityStatusQuery,
  categoryId: idQuery(),
});

export const workflowFormContract = defineContract('/api/workflows/forms', {
  list: op.get('/', { access: { permission: 'workflow:form:list' }, query: workflowFormListQuery, response: paginated(workflowFormSchema), summary: '表单分页列表' }),
  enabled: op.get('/enabled', { access: { permission: 'workflow:form:list' }, response: z.array(workflowFormSchema), summary: '全部启用表单（流程设计选用）' }),
  detail: op.get('/{id}', { access: { permission: 'workflow:form:list' }, params: idParam, response: workflowFormSchema, summary: '获取表单详情' }),
  create: op.post('/', { access: { permission: 'workflow:form:create' }, audit: '创建表单', body: createWorkflowFormSchema, response: workflowFormSchema, summary: '创建表单' }),
  duplicate: op.post('/{id}/duplicate', { access: { permission: 'workflow:form:create' }, audit: '复制表单', params: idParam, response: workflowFormSchema, summary: '复制表单' }),
  update: op.put('/{id}', { access: { permission: 'workflow:form:edit' }, audit: '更新表单', params: idParam, body: updateWorkflowFormSchema, response: workflowFormSchema, summary: '更新表单' }),
  remove: op.delete('/{id}', { access: { permission: 'workflow:form:delete' }, audit: '删除表单', params: idParam, summary: '删除表单' }),
}, { auditModule: '工作流管理', tags: ['WorkflowForms'] });
