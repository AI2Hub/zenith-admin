import { and, eq, inArray, sql } from 'drizzle-orm';
import { reportFillRecords } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export type ReportFillWorkflowOutcome = 'approved' | 'rejected' | 'withdrawn' | 'cancelled';

export interface ReportFillBridgeResult {
  changed: boolean;
  recordId: number | null;
  templateId: number | null;
  submitterId: number | null;
  approved: boolean;
}

/** 工作流终态事务内业务桥：同一实例只允许从待审状态转换一次。 */
export async function bridgeReportFillWorkflowOutcome(
  executor: DbExecutor,
  input: {
    workflowInstanceId: number;
    outcome: ReportFillWorkflowOutcome;
    actorId?: number | null;
    comment?: string | null;
  },
): Promise<ReportFillBridgeResult> {
  const status = input.outcome === 'approved'
    ? 'approved'
    : input.outcome === 'rejected'
      ? 'rejected'
      : 'cancelled';
  const [row] = await executor.update(reportFillRecords).set({
    status,
    reviewedAt: input.outcome === 'approved' || input.outcome === 'rejected' ? new Date() : undefined,
    reviewedBy: input.outcome === 'approved' || input.outcome === 'rejected'
      ? input.actorId && input.actorId > 0 ? input.actorId : null
      : undefined,
    reviewComment: input.comment?.slice(0, 1000),
    syncStatus: input.outcome === 'approved' ? 'pending' : undefined,
    syncError: input.outcome === 'approved' ? null : undefined,
    revision: sql`${reportFillRecords.revision} + 1`,
  }).where(and(
    eq(reportFillRecords.workflowInstanceId, input.workflowInstanceId),
    inArray(reportFillRecords.status, ['submitted', 'in_review']),
  )).returning({
    id: reportFillRecords.id,
    templateId: reportFillRecords.templateId,
    submitterId: reportFillRecords.submitterId,
  });
  return {
    changed: Boolean(row),
    recordId: row?.id ?? null,
    templateId: row?.templateId ?? null,
    submitterId: row?.submitterId ?? null,
    approved: Boolean(row) && input.outcome === 'approved',
  };
}
