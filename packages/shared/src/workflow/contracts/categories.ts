import * as z from 'zod';
import { auditFieldsSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWorkflowCategorySchema, updateWorkflowCategorySchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const workflowCategorySchema = z.object({
  id: z.int(),
  name: z.string().meta({ example: '人事流程' }),
  code: z.string().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  sort: z.int(),
  description: z.string().nullable(),
  tenantId: z.int().nullable(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WorkflowCategory' });

export type WorkflowCategory = z.infer<typeof workflowCategorySchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const workflowCategoryListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 编码'),
});

export const workflowCategoryContract = defineContract('/api/workflows/categories', {
  list: op.get('/', { access: { permission: 'workflow:definition:list' }, query: workflowCategoryListQuery, response: paginated(workflowCategorySchema), summary: '流程分类分页列表' }),
  // 发起工作台分组 / 待办筛选也要读取分类：放行发起与审批权限，避免非管理角色每次 ['workflow'] 缓存广播后 403 toast
  all: op.get('/all', { access: { permission: ['workflow:definition:list', 'workflow:instance:create', 'workflow:task:handle'] }, response: z.array(workflowCategorySchema), summary: '全部流程分类（不分页）' }),
  detail: op.get('/{id}', { access: { permission: 'workflow:definition:list' }, params: idParam, response: workflowCategorySchema, summary: '获取流程分类' }),
  create: op.post('/', { access: { permission: 'workflow:definition:edit' }, audit: '创建流程分类', body: createWorkflowCategorySchema, response: workflowCategorySchema, summary: '创建流程分类' }),
  update: op.put('/{id}', { access: { permission: 'workflow:definition:edit' }, audit: '更新流程分类', params: idParam, body: updateWorkflowCategorySchema, response: workflowCategorySchema, summary: '更新流程分类' }),
  remove: op.delete('/{id}', { access: { permission: 'workflow:definition:edit' }, audit: '删除流程分类', params: idParam, summary: '删除流程分类' }),
}, { auditModule: '工作流管理', tags: ['WorkflowCategories'] });
