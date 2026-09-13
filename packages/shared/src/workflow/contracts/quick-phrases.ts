import * as z from 'zod';
import { idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWorkflowQuickPhraseSchema, updateWorkflowQuickPhraseSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 审批意见常用语 */
export const workflowQuickPhraseSchema = z.object({
  id: z.int(),
  userId: z.int().nullable().meta({ description: 'null = 系统预置（所有人可见）' }),
  content: z.string().meta({ example: '同意' }),
  sort: z.int(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WorkflowQuickPhrase' });

export type WorkflowQuickPhrase = z.infer<typeof workflowQuickPhraseSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const workflowQuickPhraseContract = defineContract('/api/workflows/quick-phrases', {
  list: op.get('/', { access: 'authenticated', response: z.array(workflowQuickPhraseSchema), summary: '我的审批常用语' }),
  create: op.post('/', { access: 'authenticated', audit: '新增审批常用语', body: createWorkflowQuickPhraseSchema, response: workflowQuickPhraseSchema, summary: '新增常用语' }),
  update: op.put('/{id}', { access: 'authenticated', audit: '更新审批常用语', params: idParam, body: updateWorkflowQuickPhraseSchema, response: workflowQuickPhraseSchema, summary: '更新常用语' }),
  remove: op.delete('/{id}', { access: 'authenticated', audit: '删除审批常用语', params: idParam, summary: '删除常用语' }),
}, { auditModule: '工作流管理', tags: ['WorkflowQuickPhrases'] });
