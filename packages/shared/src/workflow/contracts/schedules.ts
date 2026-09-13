import * as z from 'zod';
import { entityStatusSchema, idParam, paginated, paginationQuery, entityStatusQuery, idQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createWorkflowScheduleSchema, updateWorkflowScheduleSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 流程定时发起规则 */
export const workflowScheduleSchema = z.object({
  id: z.int(),
  definitionId: z.int(),
  definitionName: z.string().nullable().optional(),
  name: z.string(),
  cronExpression: z.string().meta({ example: '0 9 * * 1' }),
  timezone: z.string().nullable().meta({ description: 'IANA 时区（如 Asia/Shanghai）；null = 默认 Asia/Shanghai' }),
  initiatorId: z.int(),
  initiatorName: z.string().nullable().optional(),
  titleTemplate: z.string().nullable(),
  formData: z.record(z.string(), z.unknown()).nullable(),
  status: entityStatusSchema,
  lastRunAt: z.string().nullable(),
  lastRunStatus: z.string().nullable(),
  lastRunMessage: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  tenantId: z.int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WorkflowSchedule' });

export type WorkflowSchedule = z.infer<typeof workflowScheduleSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const workflowScheduleListQuery = paginationQuery.extend({
  definitionId: idQuery(),
  status: entityStatusQuery,
});

export const workflowScheduleContract = defineContract('/api/workflows/schedules', {
  list: op.get('/', { access: { permission: 'workflow:schedule:list' }, query: workflowScheduleListQuery, response: paginated(workflowScheduleSchema), summary: '定时发起规则列表' }),
  create: op.post('/', { access: { permission: 'workflow:schedule:create' }, audit: '新建定时发起', body: createWorkflowScheduleSchema, response: workflowScheduleSchema, summary: '新建定时发起' }),
  update: op.put('/{id}', { access: { permission: 'workflow:schedule:edit' }, audit: '更新定时发起', params: idParam, body: updateWorkflowScheduleSchema, response: workflowScheduleSchema, summary: '更新定时发起' }),
  remove: op.delete('/{id}', { access: { permission: 'workflow:schedule:delete' }, audit: '删除定时发起', params: idParam, summary: '删除定时发起' }),
  run: op.post('/{id}/run', { access: { permission: 'workflow:schedule:edit' }, audit: '手动触发定时发起', params: idParam, response: workflowScheduleSchema, summary: '立即执行一次' }),
}, { auditModule: '工作流管理', tags: ['WorkflowSchedules'] });
