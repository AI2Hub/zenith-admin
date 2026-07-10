import dayjs from 'dayjs';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { asyncTasks, reportFillRecords, workflowInstances } from '../../db/schema';
import { runWithCurrentUser } from '../../lib/context';
import { resumeReportFillWorkflow } from './report-fill-record.service';
import { bridgeReportFillWorkflowOutcome } from './report-fill-workflow-bridge.service';
import {
  loadReportFillUserPayload,
  submitReportFillSyncTaskAsUser,
} from './report-fill-task.service';

const TERMINAL_WORKFLOW_STATUSES = ['approved', 'rejected', 'withdrawn', 'cancelled'] as const;

/** 有界兜底：补链工作流终态、恢复缺失实例，并重新提交未消费的批准记录。 */
export async function reconcileReportFillWorkflows(limit = 100) {
  let bridged = 0;
  let resumed = 0;
  let syncSubmitted = 0;

  const linked = await db.select({
    recordId: reportFillRecords.id,
    workflowInstanceId: reportFillRecords.workflowInstanceId,
    submitterId: reportFillRecords.submitterId,
    workflowStatus: workflowInstances.status,
  }).from(reportFillRecords)
    .innerJoin(workflowInstances, eq(workflowInstances.id, reportFillRecords.workflowInstanceId))
    .where(and(
      inArray(reportFillRecords.status, ['submitted', 'in_review']),
      inArray(workflowInstances.status, TERMINAL_WORKFLOW_STATUSES),
    ))
    .limit(limit);

  for (const row of linked) {
    const result = await db.transaction((tx) => bridgeReportFillWorkflowOutcome(tx, {
      workflowInstanceId: row.workflowInstanceId!,
      outcome: row.workflowStatus as typeof TERMINAL_WORKFLOW_STATUSES[number],
      actorId: null,
      comment: '工作流终态对账',
    }));
    if (result.changed) bridged += 1;
    if (result.approved && result.recordId) {
      await submitReportFillSyncTaskAsUser(
        result.recordId,
        result.submitterId ?? row.submitterId,
        `workflow-reconcile-${dayjs().format('YYYYMMDDHHmm')}`,
      );
      syncSubmitted += 1;
    }
  }

  const missingLinks = await db.select({
    id: reportFillRecords.id,
    submitterId: reportFillRecords.submitterId,
  }).from(reportFillRecords).where(and(
    eq(reportFillRecords.status, 'submitted'),
    isNull(reportFillRecords.workflowInstanceId),
  )).limit(Math.max(0, limit - linked.length));
  for (const row of missingLinks) {
    const user = await loadReportFillUserPayload(row.submitterId);
    await runWithCurrentUser(user, () => resumeReportFillWorkflow(row.id));
    resumed += 1;
  }

  const pendingSync = await db.select({
    id: reportFillRecords.id,
    submitterId: reportFillRecords.submitterId,
    syncTaskId: reportFillRecords.syncTaskId,
  }).from(reportFillRecords).where(and(
    eq(reportFillRecords.status, 'approved'),
    inArray(reportFillRecords.syncStatus, ['pending', 'failed']),
  )).limit(limit);
  for (const row of pendingSync) {
    const task = row.syncTaskId
      ? await db.query.asyncTasks.findFirst({
          where: eq(asyncTasks.id, row.syncTaskId),
          columns: { status: true },
        })
      : null;
    if (task && ['pending', 'running', 'success'].includes(task.status)) continue;
    await submitReportFillSyncTaskAsUser(
      row.id,
      row.submitterId,
      `sync-reconcile-${dayjs().format('YYYYMMDDHHmm')}`,
    );
    syncSubmitted += 1;
  }

  return { bridged, resumed, syncSubmitted };
}
