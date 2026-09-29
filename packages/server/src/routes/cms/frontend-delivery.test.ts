import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  site: { id: 3, code: 'delivery', name: 'Delivery', staticMode: 'static', settings: {} },
  run: vi.fn(), blocked: vi.fn(), readStatic: vi.fn(), redisGet: vi.fn(), redisSet: vi.fn(), render: vi.fn(),
}));
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../config', () => ({ config: { redis: { keyPrefix: 'test:' } } }));
vi.mock('../../lib/redis', () => ({ default: { get: state.redisGet, setex: state.redisSet } }));
vi.mock('../../lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../middleware/optional-member-session', () => ({ optionalMemberSessionMiddleware: (_ctx: unknown, next: () => Promise<void>) => next() }));
vi.mock('../../services/cms/cms-sites.service', () => ({ resolveSiteByHost: async () => state.site, resolveSiteByCode: async () => state.site }));
vi.mock('../../services/cms/cms-redirects.service', () => ({ resolveRedirect: async () => null }));
vi.mock('../../services/cms/cms-render.service', () => ({
  renderSitePath: state.render, renderSearchPage: state.render, renderContentPreviewPage: state.render,
  generateRssXml: vi.fn(), findChannelByPath: vi.fn(), ensureSiteThemeCssAsset: vi.fn(), ensureSiteIslandsAsset: vi.fn(),
}));
vi.mock('../../services/cms/cms-preview.service', () => ({ resolveCmsPreviewRevision: vi.fn() }));
vi.mock('../../services/cms/cms-generation-storage.service', () => ({
  cmsGenerationNeedsDynamicDelivery: state.blocked, withCmsPublicGeneration: (_site: number, run: () => Promise<unknown>) => state.run(run),
}));
vi.mock('../../services/cms/cms-static.service', () => ({
  readStaticFile: state.readStatic, writeStaticFile: vi.fn(), generateSitemapXml: vi.fn(), buildRobotsTxt: vi.fn(),
  isCmsStaticArtifactCurrent: async () => true, assertCmsHybridWriteSafe: vi.fn(),
}));
vi.mock('../../services/cms/cms-telemetry-context', () => ({ withCmsTelemetryEnvironment: (_env: string, run: () => unknown) => run() }));
vi.mock('../../services/cms/cms-pages.service', () => ({ resolveDynamicCmsPageForPath: async () => null }));
vi.mock('../../services/cms/cms-site-publish-lock.service', () => ({ assertCmsPublishFence: vi.fn(), withCmsStaticWriteFence: vi.fn() }));
vi.mock('../../services/cms/cms-cache.service', () => ({ readCmsCacheEpoch: async () => 'redis-epoch' }));
vi.mock('../../lib/request-helpers', () => ({ getClientIp: () => '127.0.0.1' }));

import { createCmsFrontendRoutes } from './frontend';
import { cmsDeliverySnapshot, withCmsDeliverySnapshot, withCmsGenerationContext } from '../../services/cms/cms-generation-context';
import { readCmsDeliveryMarkers, stampCmsDeliveryMarkers } from '../../services/cms/cms-delivery-markers';

const html = '<html><head><title>Delivery</title></head><body>fresh content</body></html>';
const captured = { generationId: 17, releaseId: 8, visibilityEpoch: 2, capturedVisibilityEpoch: 2 };
const request = () => createCmsFrontendRoutes().request('http://delivery.example/');

beforeEach(() => {
  vi.clearAllMocks();
  state.site.staticMode = 'static';
  state.run.mockImplementation((run: () => Promise<unknown>) => withCmsGenerationContext({ siteId: 3, ...captured, candidate: false }, run));
  state.blocked.mockResolvedValue(false);
  state.readStatic.mockResolvedValue(null);
  state.redisGet.mockResolvedValue(null);
  state.redisSet.mockResolvedValue('OK');
  state.render.mockImplementation(async () => ({ status: 200, kind: 'home', html: stampCmsDeliveryMarkers(html, cmsDeliverySnapshot()) }));
});

describe('CMS public HTML delivery snapshot', () => {
  it('serves a verified static body with matching generation, release and epoch headers', async () => {
    const cached = stampCmsDeliveryMarkers(html, captured);
    state.readStatic.mockResolvedValue(cached);
    const response = await request();
    expect(response.headers.get('X-Cms-Cache')).toBe('static');
    expect(response.headers.get('X-Cms-Generation')).toBe('17');
    expect(response.headers.get('X-Cms-Release')).toBe('8');
    expect(response.headers.get('X-Cms-Visibility-Epoch')).toBe('2');
    expect(await response.text()).toBe(cached);
    expect(state.render).not.toHaveBeenCalled();
  });
  it.each(['static', 'dynamic'])('bypasses %s cached HTML after visibility is restored at a newer epoch', async mode => {
    state.site.staticMode = mode;
    state.run.mockImplementation((run: () => Promise<unknown>) => withCmsGenerationContext({ siteId: 3, ...captured, visibilityEpoch: 4, candidate: false }, run));
    state.readStatic.mockResolvedValue(stampCmsDeliveryMarkers(html.replace('fresh', 'stale'), captured));
    state.redisGet.mockResolvedValue(stampCmsDeliveryMarkers(html.replace('fresh', 'stale'), captured));
    const response = await request();
    expect(response.headers.get('X-Cms-Visibility-Epoch')).toBe('4');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(await readCmsDeliveryMarkers(await response.text())).toEqual({ generationId: 17, releaseId: 8, visibilityEpoch: 4 });
    expect(state.readStatic).not.toHaveBeenCalled();
    expect(state.redisGet).not.toHaveBeenCalled();
    expect(state.redisSet).not.toHaveBeenCalled();
    expect(state.render).toHaveBeenCalledOnce();
  });
  it.each(['static', 'dynamic'])('rejects %s bytes that carry an old generation even if runtime overlays are clear', async mode => {
    state.site.staticMode = mode;
    const stale = stampCmsDeliveryMarkers(html.replace('fresh', 'stale'), { ...captured, generationId: 16 });
    state.readStatic.mockResolvedValue(stale);
    state.redisGet.mockResolvedValue(stale);
    const response = await request();
    expect(await response.text()).toContain('fresh content');
    expect(state.render).toHaveBeenCalledOnce();
    expect(response.headers.get('X-Cms-Cache')).toBeNull();
  });
  it('identifies an unpublished site explicitly instead of omitting marker headers', async () => {
    state.site.staticMode = 'dynamic';
    state.run.mockImplementation((run: () => Promise<unknown>) => withCmsDeliverySnapshot({ generationId: null, releaseId: null, visibilityEpoch: 5, capturedVisibilityEpoch: null }, run));
    const response = await request();
    expect(response.headers.get('X-Cms-Generation')).toBe('null');
    expect(response.headers.get('X-Cms-Release')).toBe('null');
    expect(await readCmsDeliveryMarkers(await response.text())).toEqual({ generationId: null, releaseId: null, visibilityEpoch: 5 });
  });
});
