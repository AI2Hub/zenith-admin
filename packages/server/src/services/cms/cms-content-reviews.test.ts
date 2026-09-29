import { describe, expect, it } from 'vitest';
import { cmsReviewDateIssues } from './cms-content-review-tasks';
import { extractCmsContentLinks } from './cms-deadlink.service';

describe('content review findings', () => {
  it('uses exact due boundaries, stable occurrence keys, and distinguishes expired from approaching validity', () => {
    const now = new Date('2026-09-29T08:00:00Z');
    const policy = { nextReviewAt: now, validUntil: new Date(now.getTime() + 30 * 86400000), noticeDays: 30 };
    const result = cmsReviewDateIssues(policy, now);
    expect(result.map(item => item.kind)).toEqual(['review_due', 'validity_expiring']);
    expect(cmsReviewDateIssues(policy, new Date(now.getTime() + 1)).map(item => item.key)).toEqual(result.map(item => item.key));
    expect(cmsReviewDateIssues({ ...policy, validUntil: now }, now).map(item => item.kind)).toEqual(['review_due', 'validity_expired']);
    expect(cmsReviewDateIssues({ ...policy, nextReviewAt: new Date(now.getTime() + 1), validUntil: new Date(now.getTime() + 31 * 86400000) }, now)).toEqual([]);
  });
  it('retains entity and relative links for checking while excluding contacts and same-page anchors', () => {
    const links = extractCmsContentLinks('<a href="#top">top</a><a href="mailto:info@example.org">mail</a><a href="tel:123">phone</a><a href="entity:content/123">content</a><a href="../guide.html">guide</a><a href="../guide.html">again</a><a href="javascript:alert(1)">invalid</a>');
    expect(links).toEqual(['entity:content/123', '../guide.html', 'javascript:alert(1)']);
  });
});
