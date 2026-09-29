import type { CmsContentReviewPolicy, CmsContentReviewRecord } from '@zenith/shared/cms';

export const mockCmsReviewPolicies: CmsContentReviewPolicy[] = [];
export const mockCmsReviewRecords: CmsContentReviewRecord[] = [];
export const mockCmsReviewIssueCycles = new Map<number, Record<string, number>>();
