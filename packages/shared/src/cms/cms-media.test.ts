import { describe, expect, it } from 'vitest';
import { freezeCmsMediaResult, type CmsMediaResult } from './cms-media';
import { processCmsMediaSchema } from './cms-media-validation';

const result: CmsMediaResult = { width: 1280, height: 720, duration: 24.5, format: 'mp4', videoCodec: 'h264', audioCodec: 'aac',
  focalPoint: { x: 0.2, y: 0.8 }, variants: [], poster: { url: '/poster.webp', fileId: '11111111-1111-4111-8111-111111111111', width: 1280, height: 720 }, subtitle: null };

describe('immutable CMS media output', () => {
  it('only freezes successful processing for the exact asset version and copies nested outputs', () => {
    const processing = { id: 8, assetVersionId: 21, status: 'success' as const, result: structuredClone(result) };
    expect(freezeCmsMediaResult(processing, 22)).toBeNull();
    expect(freezeCmsMediaResult({ ...processing, status: 'running' }, 21)).toBeNull();
    const frozen = freezeCmsMediaResult(processing, 21)!;
    processing.result.poster!.url = '/new-poster.webp';
    processing.result.focalPoint.x = 0.9;
    expect(frozen.poster!.url).toBe('/poster.webp');
    expect(frozen.focalPoint.x).toBe(0.2);
  });

  it('rejects out-of-range focal positions and unsafe subtitle language values', () => {
    expect(processCmsMediaSchema.safeParse({ assetVersionId: 1, focalPoint: { x: -0.1, y: 1 } }).success).toBe(false);
    expect(processCmsMediaSchema.safeParse({ assetVersionId: 1, subtitleLanguage: 'zh" onload=alert(1)' }).success).toBe(false);
    expect(processCmsMediaSchema.parse({ assetVersionId: 1 })).toMatchObject({ focalPoint: { x: 0.5, y: 0.5 }, posterTime: 0, subtitleResourceId: null });
  });
});
