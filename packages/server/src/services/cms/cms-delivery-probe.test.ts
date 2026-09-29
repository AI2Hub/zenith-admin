import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpRequest, type HttpResponse } from '../../lib/http-client';
import { probeCmsDeliveryTarget, type CmsDeliveryProbeInput } from './cms-delivery-probe';

const servers = new Set<Server>();
const markers = (generation: number | null = 17, release: number | null = 31, epoch = 4) =>
  `<meta name="cms-generation-id" content="${generation}"><meta name="cms-release-id" content="${release}"><meta name="cms-visibility-epoch" content="${epoch}">`;
const html = (generation: number | null = 17, release: number | null = 31, epoch = 4, extraHead = '') =>
  `<!doctype html><html><head>${markers(generation, release, epoch)}${extraHead}</head><body>页面内容</body></html>`;
const markerHeaders = (generation: number | null = 17, release: number | null = 31, epoch = 4) => ({
  'X-Cms-Generation': String(generation), 'X-Cms-Release': String(release), 'X-Cms-Visibility-Epoch': String(epoch),
});
const input = (baseUrl: string | null, overrides: Partial<CmsDeliveryProbeInput> = {}): CmsDeliveryProbeInput => ({
  target: 'source', baseUrl, path: '/page', expectedGenerationId: 17, expectedReleaseId: 31,
  expectedVisibilityEpoch: 4, expectedStatus: 'visible', ...overrides,
});
const withdrawalCases: { status: number; headers: Record<string, string>; body: string; expected: 'passed' | 'failed' }[] = [
  { status: 404, headers: {}, body: 'Not found', expected: 'failed' },
  { status: 404, headers: markerHeaders(), body: 'Not found', expected: 'passed' },
  { status: 410, headers: { 'Content-Type': 'text/html' }, body: html(), expected: 'passed' },
  { status: 404, headers: markerHeaders(17, 31, 3), body: 'Not found', expected: 'failed' },
  { status: 404, headers: { 'X-Cms-Generation': '17', 'X-Cms-Release': '31' }, body: 'Not found', expected: 'failed' },
  { status: 200, headers: markerHeaders(), body: html(), expected: 'failed' },
  { status: 500, headers: markerHeaders(), body: 'upstream error', expected: 'failed' },
];

async function endpoint(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.add(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return `http://127.0.0.1:${address.port}`;
}

function response(raw: Response): HttpResponse {
  return { status: raw.status, ok: raw.ok, headers: raw.headers, url: raw.url,
    text: () => raw.text(), json: <T>() => raw.json() as Promise<T>, arrayBuffer: () => raw.arrayBuffer(), raw,
  };
}

function stub(body: BodyInit | null = html(), init: ResponseInit = {}) {
  return vi.fn<typeof httpRequest>().mockResolvedValue(response(new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' }, ...init })));
}

afterEach(async () => {
  vi.useRealTimers(); vi.unstubAllEnvs();
  await Promise.all([...servers].map(async server => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }));
  servers.clear();
});

describe('CMS delivery HTTP evidence', () => {
  it('records a current origin and stale public cache separately without bypassing normal delivery', async () => {
    const sourceRequests: IncomingMessage[] = [];
    const publicRequests: IncomingMessage[] = [];
    const source = await endpoint((req, res) => {
      sourceRequests.push(req); res.writeHead(200, { 'Content-Type': 'text/html', ...markerHeaders(), 'X-Cache': 'MISS', Age: '0' }); res.end(html());
    });
    const publicUrl = await endpoint((req, res) => {
      publicRequests.push(req); res.writeHead(200, { 'Content-Type': 'text/html', ...markerHeaders(16), 'X-Cache': 'HIT', Age: '600' }); res.end(html(16));
    });
    const [origin, cached] = await Promise.all([
      probeCmsDeliveryTarget(input(`${source}/deploy`), { allowlist: ['127.0.0.1'] }),
      probeCmsDeliveryTarget(input(`${publicUrl}/deploy`, { target: 'public', sourceHost: 'must-not-be-used.example' }), { allowlist: ['127.0.0.1'] }),
    ]);
    expect(origin).toMatchObject({ status: 'passed', httpStatus: 200, generationId: 17, releaseId: 31, visibilityEpoch: 4, cacheStatus: 'MISS', age: '0' });
    expect(cached).toMatchObject({ status: 'failed', httpStatus: 200, generationId: 16, cacheStatus: 'HIT', age: '600' });
    expect(sourceRequests[0].headers.host).toBe(new URL(source).host);
    expect(publicRequests[0].headers.host).toBe(new URL(publicUrl).host);
    for (const request of [...sourceRequests, ...publicRequests]) {
      expect(request.url).toBe('/deploy/page');
      expect(request.headers['cache-control']).toBeUndefined();
      expect(request.headers.pragma).toBeUndefined();
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers.cookie).toBeUndefined();
    }
  });

  it('fails when fresh headers are wrapped around stale HTML', async () => {
    const base = await endpoint((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html', ...markerHeaders() }); res.end(html(16)); });
    const result = await probeCmsDeliveryTarget(input(base), { allowlist: ['127.0.0.1'] });
    expect(result.status).toBe('failed');
    expect(result.generationId).toBe(16);
    expect(result.message).toContain('响应头与 HTML');
  });

  it.each([
    ['only response headers', '<html><head></head><body>页面</body></html>'],
    ['markers in body', `<html><head></head><body>${markers()}</body></html>`],
    ['forged head in body', `<html><head></head><body><head>${markers()}</head></body></html>`],
    ['markers in a script', `<html><head><script>const text = '${markers()}'</script></head><body></body></html>`],
    ['markers in a comment', `<html><head><!--${markers()}--></head><body></body></html>`],
    ['markers in a template', `<html><head><template>${markers()}</template></head><body></body></html>`],
    ['conflicting duplicate meta', html(17, 31, 4, '<meta name="cms-generation-id" content="16">')],
    ['equal duplicate meta', html(17, 31, 4, '<meta name="cms-generation-id" content="17">')],
  ])('rejects %s as visible-page evidence', async (_label, body) => {
    const request = stub(body, { headers: { 'Content-Type': 'text/html', ...markerHeaders() } });
    expect((await probeCmsDeliveryTarget(input('https://public.example'), { request })).status).toBe('failed');
  });

  it('accepts explicit null identities without treating missing markers as null', async () => {
    const request = stub(html(null, null, 4), { headers: { 'Content-Type': 'text/html', ...markerHeaders(null, null) } });
    const result = await probeCmsDeliveryTarget(input('https://public.example', { expectedGenerationId: null, expectedReleaseId: null }), { request });
    expect(result).toMatchObject({ status: 'passed', generationId: null, releaseId: null, visibilityEpoch: 4 });
  });

  it.each(withdrawalCases)('requires complete current proof for withdrawn HTTP $status ($expected)', async row => {
    const request = stub(row.body, { status: row.status, headers: row.headers });
    const result = await probeCmsDeliveryTarget(input('https://public.example', { expectedStatus: 'withdrawn' }), { request });
    expect(result).toMatchObject({ status: row.expected, httpStatus: row.status });
  });

  it('does not follow redirects to another route even when the origin is trusted', async () => {
    const paths: string[] = [];
    const base = await endpoint((req, res) => {
      paths.push(req.url ?? '');
      if (req.url === '/page') { res.writeHead(302, { Location: '/hidden' }); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html()); }
    });
    expect((await probeCmsDeliveryTarget(input(base), { allowlist: ['127.0.0.1'] })).status).toBe('failed');
    expect(paths).toEqual(['/page']);
  });

  it('keeps the request timeout active after headers arrive and the body stalls', async () => {
    const base = await endpoint((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.flushHeaders(); res.write('<html><head>'); });
    // Use the real HTTP client with a shorter test deadline while asserting the production 10-second setting.
    const request = vi.fn<typeof httpRequest>((url, options) => httpRequest(url, { ...options, timeout: 1000 }));
    const result = await probeCmsDeliveryTarget(input(base), { request, allowlist: ['127.0.0.1'] });
    expect(result).toMatchObject({ status: 'failed', httpStatus: 200 });
    expect(request.mock.calls[0][1]).toMatchObject({ timeout: 10_000, ssrfProtection: true, redirect: 'error', retries: 0, logBodyLimit: 0,
      httpLog: { level: 'access', logResponseBody: false },
    });
  });

  it('enforces a hard deadline before a request resolves and cancels a late response', async () => {
    vi.useFakeTimers();
    let resolveRequest: ((value: HttpResponse) => void) | undefined;
    const cancel = vi.fn();
    const raw = new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'text/html' } });
    const request = vi.fn<typeof httpRequest>(() => new Promise<HttpResponse>(resolve => { resolveRequest = resolve; }));
    const pending = probeCmsDeliveryTarget(input('https://public.example'), { request });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ status: 'failed', httpStatus: null });
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    resolveRequest?.(response(raw));
    await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['declared size', 'streamed size', 'headers'])('bounds %s and actively cancels rejected responses', async kind => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(kind === 'streamed size' ? new Uint8Array(1024 * 1024 + 1) : new TextEncoder().encode('<html><head>'));
    }, cancel });
    const headers: Record<string, string> = { 'Content-Type': 'text/html' };
    if (kind === 'declared size') headers['Content-Length'] = String(1024 * 1024 + 1);
    if (kind === 'headers') headers['X-Large'] = 'x'.repeat(8193);
    const request = vi.fn<typeof httpRequest>().mockResolvedValue(response(new Response(stream, { headers })));
    const result = await probeCmsDeliveryTarget(input('https://public.example'), { request });
    expect(result.status).toBe('failed');
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('CMS delivery destination boundaries', () => {
  it('marks an unconfigured endpoint unverified without making a request', async () => {
    const request = stub();
    expect((await probeCmsDeliveryTarget(input(null), { request })).status).toBe('unverified');
    expect((await probeCmsDeliveryTarget(input(''), { request })).status).toBe('unverified');
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['/../private', '/x/./private', '/%2e%2e/private', '/%252e%252e/private', '//other.example/page', '/x//page', '/x\\page', '/x%2fpage', '/x%255cpage', '/x%00page', '/x%250apage', '/page?skip=1', '/page#skip', 'https://other.example/page'])('rejects unsafe path %s before HTTP', async path => {
    const request = stub();
    expect((await probeCmsDeliveryTarget(input('https://public.example', { path }), { request })).status).toBe('failed');
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['file:///etc/passwd', 'https://user:password@public.example', 'https://public.example/deploy?token=value', 'https://public.example/deploy#hash', 'https://public.example/deploy/../private', 'https://public.example/dep%2floy'])('rejects configured unsafe base %s', async base => {
    const request = stub();
    expect((await probeCmsDeliveryTarget(input(base), { request })).status).toBe('failed');
    expect(request).not.toHaveBeenCalled();
  });

  it('blocks private destinations by default and never applies a production public allowlist', async () => {
    const seen = vi.fn();
    const base = await endpoint((_req, res) => { seen(); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html()); });
    expect((await probeCmsDeliveryTarget(input(base))).status).toBe('failed');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await probeCmsDeliveryTarget(input(base, { target: 'public' }), { allowlist: ['127.0.0.1'] })).status).toBe('failed');
    expect(seen).not.toHaveBeenCalled();
  });

  it('reports an unverified source probe when a Host override cannot be sent', async () => {
    const request = vi.fn<typeof httpRequest>();
    const result = await probeCmsDeliveryTarget(input('https://source.example', { sourceHost: 'site.example' }), { request });
    // fetch 会静默丢弃 Host：与其打到默认 vhost 后给出「通过」，不如如实说明没验证到
    expect(result.status).toBe('unverified');
    expect(result.message).toContain('Host');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects unsafe source Host values and ignores Host overrides for public targets', async () => {
    const request = stub();
    expect((await probeCmsDeliveryTarget(input('https://public.example', { sourceHost: 'site.example\r\nX-Injection: yes' }), { request })).status).toBe('failed');
    expect(request).not.toHaveBeenCalled();
    expect((await probeCmsDeliveryTarget(input('https://public.example', { target: 'public', sourceHost: 'other.example' }), { request })).status).toBe('passed');
    expect(new Headers(request.mock.calls[0][1]?.headers).has('host')).toBe(false);
    expect(request.mock.calls[0][1]).toMatchObject({ ssrfProtection: true, ssrfAllowlist: [] });
  });
});
