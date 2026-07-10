import { describe, expect, it } from 'vitest';
import {
  isApprovedFillRecordConsumable,
  reportFillSyncIdempotencyKey,
} from './report-fill-task.service';

describe('report fill synchronization governance', () => {
  it('consumes approved records only', () => {
    expect(isApprovedFillRecordConsumable('approved')).toBe(true);
    for (const status of ['draft', 'submitted', 'in_review', 'rejected', 'cancelled']) {
      expect(isApprovedFillRecordConsumable(status)).toBe(false);
    }
  });

  it('uses stable revision-scoped idempotency keys', () => {
    expect(reportFillSyncIdempotencyKey(8, 3)).toBe('report-fill-sync:8:3');
    expect(reportFillSyncIdempotencyKey(8, 3)).toBe(reportFillSyncIdempotencyKey(8, 3));
    expect(reportFillSyncIdempotencyKey(8, 4)).not.toBe(reportFillSyncIdempotencyKey(8, 3));
    expect(reportFillSyncIdempotencyKey(8, 3, 'reconcile')).toBe('report-fill-sync:8:reconcile');
  });
});
