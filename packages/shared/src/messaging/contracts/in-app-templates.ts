import * as z from 'zod';
import { entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { IN_APP_MESSAGE_TYPES } from '../constants';
import { createInAppTemplateSchema, updateInAppTemplateSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const inAppTemplateSchema = z.object({
  id: z.int(),
  name: z.string(),
  code: z.string().meta({ example: 'task_assigned' }),
  title: z.string(),
  content: z.string(),
  type: z.enum(IN_APP_MESSAGE_TYPES),
  variables: z.string().nullable().meta({ description: '模板变量说明（逗号分隔）' }),
  status: entityStatusSchema,
  remark: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'InAppTemplate' });

export type InAppTemplate = z.infer<typeof inAppTemplateSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const inAppTemplateListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 编码'),
  type: queryEnum(IN_APP_MESSAGE_TYPES),
  status: entityStatusQuery,
});

export const inAppTemplateContract = defineContract('/api/in-app-templates', {
  list: op.get('/', { access: { permission: 'system:in-app-template:list' }, query: inAppTemplateListQuery, response: paginated(inAppTemplateSchema), summary: '站内信模板列表' }),
  detail: op.get('/{id}', { access: { permission: 'system:in-app-template:list' }, params: idParam, response: inAppTemplateSchema, summary: '获取站内信模板详情' }),
  create: op.post('/', { access: { permission: 'system:in-app-template:create' }, audit: '创建站内信模板', body: createInAppTemplateSchema, response: inAppTemplateSchema, summary: '创建站内信模板' }),
  update: op.put('/{id}', { access: { permission: 'system:in-app-template:update' }, audit: '更新站内信模板', params: idParam, body: updateInAppTemplateSchema, response: inAppTemplateSchema, summary: '更新站内信模板' }),
  remove: op.delete('/{id}', { access: { permission: 'system:in-app-template:delete' }, audit: '删除站内信模板', params: idParam, summary: '删除站内信模板' }),
}, { auditModule: '站内信模板', tags: ['InAppTemplates'] });
