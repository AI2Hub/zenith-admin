import { describe, expect, it } from 'vitest';
import { bizLeaveContract } from '../../biz/contracts/biz-leaves';
import { cmsContentContract } from '../../cms/contracts/contents';
import { workflowBusinessApprovalQuery, workflowBusinessContextQuery } from './business';

describe('business approval read contracts', () => {
  it('requires an exact round for approval form data, with no implicit latest fallback', () => {
    expect(workflowBusinessApprovalQuery.safeParse({}).success).toBe(false);
    expect(workflowBusinessApprovalQuery.safeParse({ instanceId: '3' }).success).toBe(true);
    expect(workflowBusinessContextQuery.parse({})).toEqual({});
    expect(bizLeaveContract.approvalDetail.query).toBe(workflowBusinessApprovalQuery);
    expect(cmsContentContract.approvalDetail.query).toBe(workflowBusinessApprovalQuery);
  });
  it('accepts incomplete form routing fields before a business draft is saved', () => {
    expect(bizLeaveContract.workflowPreview.body.safeParse({}).success).toBe(true);
    expect(bizLeaveContract.workflowPreview.body.safeParse({ days: -1 }).success).toBe(false);
    expect(cmsContentContract.workflowPreview.body.safeParse({ siteId: 1, channelId: 2 }).success).toBe(true);
    expect(cmsContentContract.workflowPreview.body.safeParse({ siteId: 1 }).success).toBe(false);
  });
});
