import * as z from 'zod';
import { idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { WORKFLOW_INSTANCE_STATUSES } from '../../workflow/constants';
import { BIZ_LEAVE_STATUSES } from '../constants';
import { createBizLeaveSchema, updateBizLeaveSchema, previewBizLeaveWorkflowSchema } from '../validation';
import { workflowBusinessApprovalQuery, workflowBusinessContextQuery, workflowBusinessContextSchema, workflowBusinessPreviewSchema } from '../../workflow/contracts/business';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 业务接入示例：请假单（业务模块自有实体，通过 businessKey 关联工作流） */
export const bizLeaveSchema = z.object({
  id: z.int(),
  leaveType: z.string().meta({ description: '请假类型：annual=年假, sick=病假, personal=事假, marriage=婚假, other=其他', example: 'annual' }),
  startDate: z.string().meta({ description: '开始日期 YYYY-MM-DD' }),
  endDate: z.string().meta({ description: '结束日期 YYYY-MM-DD' }),
  days: z.number(),
  reason: z.string().nullable(),
  status: z.enum(BIZ_LEAVE_STATUSES),
  workflowInstanceId: z.int().nullable().meta({ description: '关联的工作流实例 ID（提交审批后回填）' }),
  workflowStatus: z.enum(WORKFLOW_INSTANCE_STATUSES).nullable().meta({ description: '冗余的工作流状态，便于列表展示' }),
  applicantId: z.int().nullable().meta({ description: '申请人（= createdBy）' }),
  applicantName: z.string().nullable().optional(),
  tenantId: z.int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'BizLeave' });

export type BizLeave = z.infer<typeof bizLeaveSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const bizLeaveListQuery = paginationQuery.extend({
  keyword: keywordQuery('事由'),
  status: queryEnum(BIZ_LEAVE_STATUSES, '按业务状态过滤'),
});

export const bizLeaveContract = defineContract('/api/biz/leaves', {
  list: op.get('/', { access: 'authenticated', query: bizLeaveListQuery, response: paginated(bizLeaveSchema), summary: '我的请假列表' }),
  detail: op.get('/{id}', { access: 'authenticated', params: idParam, response: bizLeaveSchema, summary: '请假详情' }),
  approvalDetail: op.get('/{id}/detail', { access: 'authenticated', params: idParam, query: workflowBusinessApprovalQuery, response: bizLeaveSchema, summary: '指定审批轮次的当前请假资料' }),
  workflowPreview: op.post('/workflow-preview', { access: 'authenticated', body: previewBizLeaveWorkflowSchema, response: workflowBusinessPreviewSchema, summary: '请假审批链路预览（不保存）' }),
  workflowContext: op.get('/{id}/workflow', { access: 'authenticated', params: idParam, query: workflowBusinessContextQuery, response: workflowBusinessContextSchema, summary: '请假单审批流程与往次记录' }),
  create: op.post('/', { access: 'authenticated', body: createBizLeaveSchema, response: bizLeaveSchema, summary: '新建请假单（草稿）' }),
  update: op.put('/{id}', { access: 'authenticated', params: idParam, body: updateBizLeaveSchema, response: bizLeaveSchema, summary: '编辑请假单（仅草稿）' }),
  remove: op.delete('/{id}', { access: 'authenticated', params: idParam, summary: '删除请假单（仅草稿）' }),
  submit: op.post('/{id}/submit', { access: 'authenticated', params: idParam, response: bizLeaveSchema, summary: '提交审批（发起并关联工作流）' }),
  reopen: op.post('/{id}/reopen', { access: 'authenticated', params: idParam, response: bizLeaveSchema, summary: '重新编辑（驳回/取消后转回草稿，可修改后再次提交）' }),
}, { tags: ['BizLeave'] });
