import { describe, expect, it } from 'vitest';
import { cmsDeliveryHeaders, cmsDeliveryEpochRequiresDynamic, cmsHtmlMatchesDelivery, readCmsDeliveryMarkers, stampCmsDeliveryMarkers } from './cms-delivery-markers';
import { cmsDeliverySnapshot, withCmsDeliverySnapshot, withCmsGenerationContext } from './cms-generation-context';
import { rebindCmsArtifactAttribution } from './cms-release-build-artifacts';

const html = '<!DOCTYPE html><html><head><title>Public page</title></head><body>Current content</body></html>';
const first = { generationId: 17, releaseId: 8, visibilityEpoch: 2, capturedVisibilityEpoch: 2 };

describe('CMS public delivery markers', () => {
  it('marks HTML without analytics and keeps the three response headers identical', async () => {
    const marked = stampCmsDeliveryMarkers(html, first);
    expect(await readCmsDeliveryMarkers(marked)).toEqual({ generationId: 17, releaseId: 8, visibilityEpoch: 2 });
    expect(cmsDeliveryHeaders(first)).toEqual({ 'X-Cms-Generation': '17', 'X-Cms-Release': '8', 'X-Cms-Visibility-Epoch': '2' });
    expect(marked.indexOf('cms-generation-id')).toBeLessThan(marked.indexOf('</head>'));
  });
  it('distinguishes an identified unpublished site from missing or duplicated markers', async () => {
    await withCmsDeliverySnapshot({ generationId: null, releaseId: null, visibilityEpoch: 7, capturedVisibilityEpoch: null }, async () => {
      const marked = stampCmsDeliveryMarkers(html, cmsDeliverySnapshot());
      expect(await readCmsDeliveryMarkers(marked)).toEqual({ generationId: null, releaseId: null, visibilityEpoch: 7 });
      expect(cmsDeliveryHeaders(cmsDeliverySnapshot())['X-Cms-Generation']).toBe('null');
      expect(await cmsHtmlMatchesDelivery(html, cmsDeliverySnapshot())).toBe(false);
      expect(await readCmsDeliveryMarkers(marked.replace('</head>', '<meta name="cms-visibility-epoch" content="7"/></head>'))).toBeNull();
    });
  });
  it('keeps restored visibility dynamic even after every live blocking flag has cleared', async () => {
    const restored = { ...first, visibilityEpoch: 4 };
    expect(cmsDeliveryEpochRequiresDynamic(first)).toBe(false);
    expect(cmsDeliveryEpochRequiresDynamic(restored)).toBe(true);
    const stale = stampCmsDeliveryMarkers(html, first);
    expect(await cmsHtmlMatchesDelivery(stale, restored)).toBe(false);
    expect(await cmsHtmlMatchesDelivery(stampCmsDeliveryMarkers(html, restored), restored)).toBe(true);
  });
  it('does not accept marker-looking text from scripts, comments, body or implicit heads', async () => {
    const tags = '<meta name="cms-generation-id" content="17"/><meta name="cms-release-id" content="8"/><meta name="cms-visibility-epoch" content="2"/>';
    for (const invalid of [tags, `<html><head><!--${tags}--></head><body></body></html>`, `<html><head><script>${tags}</script></head><body></body></html>`, `<html><head></head><body><div>${tags}</div></body></html>`]) {
      expect(await readCmsDeliveryMarkers(invalid)).toBeNull();
    }
  });
  it('rebinds reused artifact markers to exactly the full-build bytes', () => {
    const next = { generationId: 18, releaseId: 9, visibilityEpoch: 4 };
    const stale = stampCmsDeliveryMarkers(html, first);
    expect(rebindCmsArtifactAttribution(stale, next.releaseId, next.generationId, next.visibilityEpoch))
      .toBe(stampCmsDeliveryMarkers(html, next));
  });
  it('uses the generation snapshot across awaited rendering and restores the outer delivery state', async () => {
    await withCmsDeliverySnapshot({ generationId: null, releaseId: null, visibilityEpoch: 9, capturedVisibilityEpoch: null }, async () => {
      await withCmsGenerationContext({ siteId: 3, ...first, candidate: true }, async () => {
        await Promise.resolve();
        expect(cmsDeliverySnapshot()).toEqual(first);
      });
      expect(cmsDeliverySnapshot().visibilityEpoch).toBe(9);
    });
  });
});
