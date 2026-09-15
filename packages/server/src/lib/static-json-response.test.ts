import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { describe, expect, it, vi } from 'vitest';
import { acceptsGzip, createStaticJsonResponder, ifNoneMatchHits } from './static-json-response';

const payload = { message: '接口目录'.repeat(500) };
const hash = (body: string | Uint8Array) => `"${createHash('sha256').update(body).digest('base64url')}"`;

function setup(build: () => unknown = () => payload, vary = 'Origin') {
  const responder = createStaticJsonResponder(build);
  const app = new Hono();
  // 使用应用实际的压缩中间件，守住预压缩不会被再次压缩、原文不会改变强 ETag 的语义。
  app.use('*', compress());
  app.use('*', async (c, next) => {
    c.header('Vary', vary);
    await next();
  });
  app.get('/', (c) => responder.respond(c));
  return { app, responder };
}

describe('static JSON response', () => {
  it('builds and serializes lazily once, and replays readable responses after earlier bodies are consumed', async () => {
    const serialize = vi.fn(() => payload);
    const build = vi.fn(() => ({ toJSON: serialize }));
    const { app, responder } = setup(build);
    expect(build).not.toHaveBeenCalled();

    const first = await app.request('/');
    expect(first.status).toBe(200);
    expect(first.headers.get('Content-Type')).toBe('application/json; charset=UTF-8');
    expect(first.headers.get('Cache-Control')).toBe('private, no-cache, no-transform');
    expect(first.headers.get('Vary')).toBe('Origin, Accept-Encoding');
    expect(await first.json()).toEqual(payload);
    const representation = responder.representation();
    expect(first.headers.get('ETag')).toBe(hash(representation.json));

    for (let i = 0; i < 2; i++) {
      const compressed = await app.request('/', { headers: { 'Accept-Encoding': 'gzip' } });
      const bytes = Buffer.from(await compressed.arrayBuffer());
      expect(compressed.status).toBe(200);
      expect(compressed.headers.get('Content-Encoding')).toBe('gzip');
      expect(compressed.headers.get('ETag')).toBe(hash(bytes));
      expect(compressed.headers.get('ETag')).not.toBe(first.headers.get('ETag'));
      expect(gunzipSync(bytes).toString()).toBe(representation.json);
    }
    expect(await (await app.request('/')).json()).toEqual(payload);
    expect(build).toHaveBeenCalledTimes(1);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(responder.representation()).toBe(representation);
  });

  it.each(['identity', 'gzip'])('returns bodyless 304 for %s validators, with the same cache metadata', async (encoding) => {
    const { app } = setup();
    const headers = { 'Accept-Encoding': encoding };
    const first = await app.request('/', { headers });
    const etag = first.headers.get('ETag')!;
    await first.arrayBuffer();

    for (const validator of [etag, `W/${etag}`, `"older", W/${etag}`, '*']) {
      const response = await app.request('/', { headers: { ...headers, 'If-None-Match': validator } });
      expect(response.status).toBe(304);
      expect(response.body).toBeNull();
      expect(await response.text()).toBe('');
      for (const name of ['ETag', 'Cache-Control', 'Vary']) {
        expect(response.headers.get(name)).toBe(first.headers.get(name));
      }
      expect(response.headers.has('Content-Encoding')).toBe(false);
      expect(response.headers.has('Content-Type')).toBe(false);
    }
  });

  it('sends 200 for changed content or another content encoding', async () => {
    const { app: previous } = setup(() => ({ version: 1 }));
    const { app } = setup(() => ({ version: 2 }));
    const old = await previous.request('/');
    const current = await app.request('/', { headers: { 'If-None-Match': old.headers.get('ETag')! } });
    expect(current.status).toBe(200);
    expect(current.headers.get('ETag')).not.toBe(old.headers.get('ETag'));
    expect(await current.json()).toEqual({ version: 2 });

    const gzip = await app.request('/', {
      headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': current.headers.get('ETag')! },
    });
    expect(gzip.status).toBe(200);
    expect(gzip.headers.get('ETag')).not.toBe(current.headers.get('ETag'));
    expect(JSON.parse(gunzipSync(Buffer.from(await gzip.arrayBuffer())).toString())).toEqual({ version: 2 });
  });

  it.each(['gzip;q=0, *;q=1', '*;q=1, gzip;q=0', 'deflate', 'identity'])('keeps identity bytes and strong ETag when gzip is unavailable: %s', async (encoding) => {
    const { app } = setup();
    const response = await app.request('/', { headers: { 'Accept-Encoding': encoding } });
    expect(response.headers.has('Content-Encoding')).toBe(false);
    const body = await response.text();
    expect(response.headers.get('ETag')).toBe(hash(body));
    expect(JSON.parse(body)).toEqual(payload);
  });

  it.each(['*', 'Origin, Accept-Encoding'])('preserves existing Vary: %s', async (vary) => {
    const { app } = setup(undefined, vary);
    expect((await app.request('/')).headers.get('Vary')).toBe(vary);
  });
});

describe('conditional request headers', () => {
  it.each([
    [undefined, false], ['', false], ['br, deflate', false], ['gzip', true],
    ['br, GZip;q=0.5', true], ['gzip;q=0', false], ['*;q=0.5', true],
    ['gzip;q=0, *;q=1', false], ['*;q=1, gzip;q=0', false],
    ['*;q=0, gzip;q=1', true], ['gzip;q=invalid', false],
  ])('negotiates gzip from %s', (header, expected) => {
    expect(acceptsGzip(header)).toBe(expected);
  });

  it('uses weak comparison for GET, including lists and wildcard', () => {
    expect(ifNoneMatchHits(undefined, '"current"')).toBe(false);
    expect(ifNoneMatchHits('"old"', '"current"')).toBe(false);
    expect(ifNoneMatchHits('"old", W/"current"', '"current"')).toBe(true);
    expect(ifNoneMatchHits('"current"', 'W/"current"')).toBe(true);
    expect(ifNoneMatchHits('*', '"current"')).toBe(true);
  });
});
