import { describe, expect, it } from 'vitest';
import type { DbExecutor } from '../../db/types';
import { bridgeReportFillWorkflowOutcome } from './report-fill-workflow-bridge.service';

function executorReturning(
  rows: Array<{ id: number; templateId: number; submitterId: number } | null>,
  onSet?: (values: Record<string, unknown>) => void,
): DbExecutor {
  return {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        onSet?.(values);
        return {
          where: () => ({
            returning: async () => {
              const row = rows.shift();
              return row ? [row] : [];
            },
          }),
        };
      },
    }),
  } as DbExecutor;
}

describe('report fill workflow bridge', () => {
  it('applies a terminal outcome exactly once', async () => {
    const executor = executorReturning([
      { id: 11, templateId: 7, submitterId: 5 },
      null,
    ]);
    const first = await bridgeReportFillWorkflowOutcome(executor, {
      workflowInstanceId: 99,
      outcome: 'approved',
      actorId: 3,
    });
    const duplicate = await bridgeReportFillWorkflowOutcome(executor, {
      workflowInstanceId: 99,
      outcome: 'approved',
      actorId: 3,
    });
    expect(first).toEqual({
      changed: true,
      recordId: 11,
      templateId: 7,
      submitterId: 5,
      approved: true,
    });
    expect(duplicate.changed).toBe(false);
    expect(duplicate.approved).toBe(false);
  });

  it('maps rejection to a non-consumable terminal result', async () => {
    const result = await bridgeReportFillWorkflowOutcome(
      executorReturning([{ id: 12, templateId: 7, submitterId: 5 }]),
      { workflowInstanceId: 100, outcome: 'rejected', actorId: 4, comment: '资料不完整' },
    );
    expect(result.changed).toBe(true);
    expect(result.approved).toBe(false);
  });

  it('does not persist the system actor sentinel as a user foreign key', async () => {
    let written: Record<string, unknown> | undefined;
    await bridgeReportFillWorkflowOutcome(
      executorReturning([{ id: 13, templateId: 7, submitterId: 5 }], (values) => { written = values; }),
      { workflowInstanceId: 101, outcome: 'approved', actorId: 0 },
    );
    expect(written?.reviewedBy).toBeNull();
  });
});
