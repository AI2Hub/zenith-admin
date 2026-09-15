/**
 * 进程内静态 JSON 响应：随发布才变化的大体积只读载荷（接口目录 ~1 MB）
 * 序列化、gzip 预压缩与 ETag 只算一次，之后每次请求只比对 `If-None-Match`——
 * 命中回 304 无正文，未命中直接回放预压缩字节，省掉每请求 ~25 ms `JSON.stringify` + ~30 ms gzip。
 *
 * 缓存策略 `private, no-cache, no-transform`：浏览器可存但每次都回源校验，认证 / 权限中间件仍逐次执行；
 * 304 后 `fetch()` 拿到的是本地缓存的 200 正文，调用方无感。
 * 原文与 gzip 分别按字节计算强 ETag；no-transform 防止下游压缩中间件或代理改变表示。
 *
 * 与 `openapi-doc-cache.ts`（OpenAPI 文档，worker 线程预热）同思路；这里的载荷构建只有几十毫秒，
 * 首个请求懒构建即可，不需要 worker。
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { Context } from 'hono';

export interface StaticJsonRepresentation {
  /** 响应体原文 */
  readonly json: string;
  /** 预压缩字节 */
  readonly gzip: Uint8Array<ArrayBuffer>;
  /** 原文的强 ETag */
  readonly etag: string;
  /** gzip 字节的强 ETag */
  readonly gzipEtag: string;
}

export interface StaticJsonResponder {
  /** 取（首次调用时构建）序列化表示 */
  readonly representation: () => StaticJsonRepresentation;
  /** 按 `If-None-Match` / `Accept-Encoding` 回应：304 或带缓存头的 200 */
  readonly respond: (c: Context) => Response;
}

const JSON_CONTENT_TYPE = 'application/json; charset=UTF-8';

function etagOf(body: string | Uint8Array): string {
  return `"${createHash('sha256').update(body).digest('base64url')}"`;
}

/** `If-None-Match` 弱比较：忽略 `W/` 前缀，支持逗号分隔多值与 `*` */
export function ifNoneMatchHits(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const strip = (tag: string) => tag.trim().replace(/^W\//, '');
  const wanted = strip(etag);
  return header.split(',').some((tag) => {
    const candidate = tag.trim();
    return candidate === '*' || strip(candidate) === wanted;
  });
}

/** `Accept-Encoding` 是否接受 gzip（`gzip` 或 `*`，且 q 值不为 0） */
export function acceptsGzip(header: string | undefined): boolean {
  if (!header) return false;
  let wildcard = false;
  for (const part of header.split(',')) {
    const [token, ...params] = part.split(';');
    const name = token.trim().toLowerCase();
    if (name !== 'gzip' && name !== '*') continue;
    const q = params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith('q='));
    const accepted = q === undefined || Number(q.slice(2)) > 0;
    // 显式 gzip;q=0 优先于通配符，无论两者顺序如何。
    if (name === 'gzip') return accepted;
    wildcard = accepted;
  }
  return wildcard;
}

function toArrayBufferBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

/** `build` 返回完整响应体（含 `okBody` 信封）；只在首个请求时调用一次 */
export function createStaticJsonResponder(build: () => unknown): StaticJsonResponder {
  let cached: StaticJsonRepresentation | null = null;
  const representation = (): StaticJsonRepresentation => {
    if (!cached) {
      const json = JSON.stringify(build());
      const gzip = toArrayBufferBytes(gzipSync(json));
      cached = { json, gzip, etag: etagOf(json), gzipEtag: etagOf(gzip) };
    }
    return cached;
  };
  const respond = (c: Context): Response => {
    const rep = representation();
    const gzip = acceptsGzip(c.req.header('accept-encoding'));
    const etag = gzip ? rep.gzipEtag : rep.etag;
    const vary = c.res.headers.get('Vary');
    c.header('ETag', etag);
    c.header('Cache-Control', 'private, no-cache, no-transform');
    // 通过 Context 更新：Hono 最终合并响应时会保留 Context 上已有的头。
    if (vary !== '*' && !vary?.split(',').some((token) => token.trim().toLowerCase() === 'accept-encoding')) {
      c.header('Vary', [vary, 'Accept-Encoding'].filter(Boolean).join(', '));
    }
    if (ifNoneMatchHits(c.req.header('if-none-match'), etag)) return c.newResponse(null, 304);
    if (gzip) {
      return c.newResponse(rep.gzip, 200, { 'Content-Type': JSON_CONTENT_TYPE, 'Content-Encoding': 'gzip' });
    }
    return c.newResponse(rep.json, 200, { 'Content-Type': JSON_CONTENT_TYPE });
  };
  return { representation, respond };
}
