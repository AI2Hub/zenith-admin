import { describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  assertReportFillRecordRevision,
  isReportFillRecordActionAllowed,
} from './report-fill-state';

describe('report fill state machine', () => {
  it('allows only valid lifecycle actions', () => {
    expect(isReportFillRecordActionAllowed('draft', 'edit')).toBe(true);
    expect(isReportFillRecordActionAllowed('rejected', 'submit')).toBe(true);
    expect(isReportFillRecordActionAllowed('in_review', 'review')).toBe(true);
    expect(isReportFillRecordActionAllowed('in_review', 'cancel')).toBe(true);
    expect(isReportFillRecordActionAllowed('approved', 'edit')).toBe(false);
    expect(isReportFillRecordActionAllowed('cancelled', 'submit')).toBe(false);
    expect(isReportFillRecordActionAllowed('draft', 'review')).toBe(false);
  });

  it('rejects stale optimistic revisions with conflict status', () => {
    expect(() => assertReportFillRecordRevision(3, 3)).not.toThrow();
    try {
      assertReportFillRecordRevision(4, 3);
      throw new Error('expected revision conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPException);
      expect((error as HTTPException).status).toBe(409);
    }
  });
});
