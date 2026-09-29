import type { CmsDeliveryObservation } from '@zenith/shared/cms';
import { httpRequest, type HttpResponse } from '../../lib/http-client';
import { formatDateTime } from '../../lib/datetime';
import { readCmsDeliveryMarkerValues } from './cms-delivery-markers';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_HEADER_BYTES = 32 * 1024;
const MAX_HEADER_VALUE_BYTES = 8 * 1024;
const MARKERS = [
  { key: 'generationId', header: 'x-cms-generation', nullable: true },
  { key: 'releaseId', header: 'x-cms-release', nullable: true },
  { key: 'visibilityEpoch', header: 'x-cms-visibility-epoch', nullable: false },
] as const;
type MarkerKey = (typeof MARKERS)[number]['key'];
type Markers = Partial<Record<MarkerKey, number | null>>;

export type CmsDeliveryProbeInput = {
  target: 'source' | 'public';
  baseUrl: string | null;
  path: string;
  expectedGenerationId: number | null;
  expectedReleaseId: number | null;
  expectedVisibilityEpoch: number;
  expectedStatus: 'visible' | 'withdrawn';
  sourceHost?: string | null;
};

class ProbeFailure extends Error {}

/** Validate before WHATWG URL parsing can remove dot segments or convert backslashes. */
function validatePath(raw: string): void {
  if (!raw.startsWith('/') || raw.length > 2048) throw new ProbeFailure('探测路径须为不超过 2048 字符的站内绝对路径');
  let decoded = raw;
  for (let depth = 0; depth < 5; depth++) {
    if (decoded.includes('//') || /[\\?#\p{Cc}\s]/u.test(decoded)
      || decoded.split('/').some(part => part === '.' || part === '..')
      || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(decoded)) {
      throw new ProbeFailure('探测路径不能包含跨目录、重复斜线、转义斜线或控制字符');
    }
    if (!decoded.includes('%')) return;
    let next: string;
    try { next = decodeURIComponent(decoded); }
    catch { throw new ProbeFailure('探测路径包含无效的百分号转义'); }
    if (next === decoded) return;
    decoded = next;
  }
  throw new ProbeFailure('探测路径包含过多层转义');
}

function targetUrl(baseUrl: string, path: string): URL {
  if (baseUrl.length > 4096 || !/^https?:\/\//iu.test(baseUrl) || /[\\?#\p{Cc}\s]/u.test(baseUrl)) {
    throw new ProbeFailure('探测入口须为不含凭证、查询参数或片段的 HTTP/HTTPS 地址');
  }
  let base: URL;
  try { base = new URL(baseUrl); }
  catch { throw new ProbeFailure('探测入口地址格式无效'); }
  if (base.username || base.password || !base.hostname) throw new ProbeFailure('探测入口不能携带用户名或密码');
  const pathStart = baseUrl.indexOf('/', baseUrl.indexOf('://') + 3);
  validatePath(pathStart < 0 ? '/' : baseUrl.slice(pathStart));
  validatePath(path);
  const result = new URL(base.origin);
  result.pathname = `${base.pathname.replace(/\/$/u, '')}${path}`;
  return result;
}

function sourceHostHeader(value: string): string {
  if (value.length > 300 || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/iu.test(value)) {
    throw new ProbeFailure('源站 Host 配置无效');
  }
  let parsed: URL;
  try { parsed = new URL(`http://${value}`); }
  catch { throw new ProbeFailure('源站 Host 配置无效'); }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/') throw new ProbeFailure('源站 Host 配置无效');
  return parsed.host;
}

function markerValue(raw: string, nullable: boolean): number | null {
  const value = raw.trim();
  if (nullable && value === 'null') return null;
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw new ProbeFailure('响应版本标记格式无效');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (nullable ? 1 : 0)) throw new ProbeFailure('响应版本标记超出允许范围');
  return number;
}

function validateHeaders(headers: Headers, checkBodySize = true): void {
  let bytes = 0;
  for (const [name, value] of headers) {
    const length = Buffer.byteLength(value);
    bytes += Buffer.byteLength(name) + length + 4;
    if (length > MAX_HEADER_VALUE_BYTES || bytes > MAX_HEADER_BYTES) throw new ProbeFailure('响应头超过探测大小限制');
  }
  const length = headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length)) || (checkBodySize && Number(length) > MAX_BODY_BYTES))) {
    throw new ProbeFailure('响应 Content-Length 无效或超过 1 MiB');
  }
}

function headerMarkers(headers: Headers): Markers {
  const markers: Markers = {};
  for (const marker of MARKERS) {
    const value = headers.get(marker.header);
    if (value !== null) markers[marker.key] = markerValue(value, marker.nullable);
  }
  return markers;
}

async function htmlMarkers(html: string): Promise<Markers> {
  // 与缓存版本判断复用同一 HTML5 head 解析器；输入已由流读取限制为 1 MiB。
  try { return await readCmsDeliveryMarkerValues(html); }
  catch { throw new ProbeFailure('HTML 版本标记格式无效或重复冲突'); }
}

async function readBoundedBody(response: HttpResponse, signal: AbortSignal): Promise<Uint8Array> {
  const body = response.raw.body;
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new ProbeFailure('探测超时，响应正文未完成');
      const chunk = await reader.read();
      if (signal.aborted) throw new ProbeFailure('探测超时，响应正文未完成');
      if (chunk.done) { complete = true; break; }
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) throw new ProbeFailure('响应正文超过 1 MiB');
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

function verifyMarkers(input: CmsDeliveryProbeInput, body: Markers, headers: Markers): Markers {
  const expected: Record<MarkerKey, number | null> = {
    generationId: input.expectedGenerationId, releaseId: input.expectedReleaseId, visibilityEpoch: input.expectedVisibilityEpoch,
  };
  const actual: Markers = {};
  for (const marker of MARKERS) {
    const hasBody = Object.hasOwn(body, marker.key);
    const hasHeader = Object.hasOwn(headers, marker.key);
    if (hasBody && hasHeader && body[marker.key] !== headers[marker.key]) throw new ProbeFailure('响应头与 HTML 的版本标记不一致，可能命中旧缓存');
    if (input.expectedStatus === 'visible' ? !hasBody : !hasBody && !hasHeader) {
      throw new ProbeFailure(input.expectedStatus === 'visible' ? 'HTML 缺少完整交付版本标记，响应头不能替代正文证明' : '撤回响应缺少完整版本证明，不能把普通 404 视为撤回成功');
    }
    actual[marker.key] = hasBody ? body[marker.key] : headers[marker.key];
    if (actual[marker.key] !== expected[marker.key]) throw new ProbeFailure('响应版本或可见性纪元与当前发布目标不一致，可能命中旧缓存');
  }
  return actual;
}

/** Read the normal delivery URL without cache bypasses, retries, redirects, credentials or body logging. */
export async function probeCmsDeliveryTarget(
  input: CmsDeliveryProbeInput,
  options: { request?: typeof httpRequest; allowlist?: string[] } = {},
): Promise<CmsDeliveryObservation> {
  const observation: CmsDeliveryObservation = {
    target: input.target, path: input.path, url: null, status: 'failed', httpStatus: null,
    generationId: null, releaseId: null, visibilityEpoch: null, cacheStatus: null, age: null, message: '', checkedAt: '',
  };
  const finish = (status: CmsDeliveryObservation['status'], message: string): CmsDeliveryObservation => ({ ...observation, status, message, checkedAt: formatDateTime(new Date()) });
  if (input.baseUrl === null || input.baseUrl.trim() === '') return finish('unverified', input.target === 'source' ? '未配置源站探测入口' : '未配置公开探测入口');

  const controller = new AbortController();
  let response: HttpResponse | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const id of [input.expectedGenerationId, input.expectedReleaseId]) if (id !== null && (!Number.isSafeInteger(id) || id < 1)) throw new ProbeFailure('探测期望版本标识无效');
    if (!Number.isSafeInteger(input.expectedVisibilityEpoch) || input.expectedVisibilityEpoch < 0) throw new ProbeFailure('探测期望可见性纪元无效');
    const url = targetUrl(input.baseUrl, input.path);
    observation.url = url.toString();
    const host = input.target === 'source' && input.sourceHost ? sourceHostHeader(input.sourceHost) : undefined;
    // 源站私网许可由调用方校验其配置来源后显式传入；公开生产请求永远不能使用私网 allowlist。
    const allowlist = input.target === 'source' || process.env.NODE_ENV === 'test' ? options.allowlist ?? [] : [];
    const request = options.request ?? httpRequest;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProbeFailure('探测超过 10 秒，未能取得完整交付证明')); }, TIMEOUT_MS);
      timer.unref?.();
    });
    const inspect = async (): Promise<CmsDeliveryObservation> => {
      response = await request(url.toString(), {
        method: 'GET', redirect: 'error', credentials: 'omit', timeout: TIMEOUT_MS, signal: controller.signal,
        retries: 0, circuitBreaker: false, ssrfProtection: true, ssrfAllowlist: allowlist,
        headers: host ? { Host: host } : undefined, logBodyLimit: 0, httpLog: { level: 'access', logResponseBody: false },
      });
      if (controller.signal.aborted) {
        if (response.raw.body) void response.raw.body.cancel().catch(() => undefined);
        throw new ProbeFailure('探测已超时');
      }
      observation.httpStatus = response.status;
      validateHeaders(response.headers);
      observation.cacheStatus = (response.headers.get('cache-status') ?? response.headers.get('cf-cache-status') ?? response.headers.get('x-cache') ?? response.headers.get('x-cache-status'))?.slice(0, 512) ?? null;
      observation.age = response.headers.get('age')?.slice(0, 64) ?? null;
      const headers = headerMarkers(response.headers);
      observation.generationId = headers.generationId ?? null;
      observation.releaseId = headers.releaseId ?? null;
      observation.visibilityEpoch = headers.visibilityEpoch ?? null;
      if (response.raw.redirected || (response.status >= 300 && response.status < 400)) throw new ProbeFailure('探测路径发生重定向，未能验证原始交付路径');
      const allowedStatus = input.expectedStatus === 'visible' ? response.status === 200 : response.status === 404 || response.status === 410;
      if (!allowedStatus) throw new ProbeFailure(input.expectedStatus === 'visible' ? '公开页面未返回 HTTP 200' : '目标仍可见或返回异常状态，撤回目标必须返回 HTTP 404/410');
      const isHtml = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '');
      if (input.expectedStatus === 'visible' && !isHtml) throw new ProbeFailure('公开页面没有返回 HTML 内容类型');
      const bytes = await readBoundedBody(response, controller.signal);
      const body: Markers = isHtml ? await htmlMarkers(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : {};
      // 即便比对失败也记录实际正文标记，便于区分旧缓存与未配置证明。
      observation.generationId = Object.hasOwn(body, 'generationId') ? body.generationId ?? null : observation.generationId;
      observation.releaseId = Object.hasOwn(body, 'releaseId') ? body.releaseId ?? null : observation.releaseId;
      observation.visibilityEpoch = Object.hasOwn(body, 'visibilityEpoch') ? body.visibilityEpoch ?? null : observation.visibilityEpoch;
      verifyMarkers(input, body, headers);
      return finish('passed', input.expectedStatus === 'visible' ? 'HTTP 200 与 HTML 版本标记均符合当前发布目标' : 'HTTP 404/410 与完整版本证明均符合当前撤回目标');
    };
    return await Promise.race([inspect(), deadline]);
  } catch (error) {
    return finish('failed', error instanceof ProbeFailure ? error.message : controller.signal.aborted ? '探测超时或响应读取中断' : 'HTTP 探测失败：网络、重定向、响应编码或访问策略异常');
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    if (response?.raw.body && !response.raw.body.locked) void response.raw.body.cancel().catch(() => undefined);
  }
}

/** A revoked asset is verified at its actual delivery URL; HTML generation markers do not prove binary denial. */
export async function probeCmsDeliveryAsset(
  input: { target: 'source' | 'public'; url: string | null; path: string },
  options: { request?: typeof httpRequest; allowlist?: string[] } = {},
): Promise<CmsDeliveryObservation> {
  const observation: CmsDeliveryObservation = {
    target: input.target, path: input.path, url: null, status: 'failed', httpStatus: null,
    generationId: null, releaseId: null, visibilityEpoch: null, cacheStatus: null, age: null, message: '', checkedAt: '',
  };
  const finish = (status: CmsDeliveryObservation['status'], message: string): CmsDeliveryObservation => ({ ...observation, status, message, checkedAt: formatDateTime(new Date()) });
  if (input.url === null || input.url.trim() === '') return finish('unverified', '无法安全构造素材实际交付 URL，尚未验证素材访问是否被拒绝');
  const controller = new AbortController();
  let response: HttpResponse | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (input.url.length > 8192 || !/^https?:\/\//iu.test(input.url) || /[\\\p{Cc}\s]/u.test(input.url)) throw new ProbeFailure('素材交付地址须为有效的 HTTP/HTTPS URL');
    let url: URL;
    try { url = new URL(input.url); }
    catch { throw new ProbeFailure('素材交付地址格式无效'); }
    if (url.username || url.password || url.hash || !url.hostname) throw new ProbeFailure('素材交付地址不能携带用户名、密码或片段');
    // 保留素材实际地址已有的查询参数（例如存储签名），不添加任何缓存绕过参数。
    observation.url = url.toString();
    const request = options.request ?? httpRequest;
    const allowlist = input.target === 'source' || process.env.NODE_ENV === 'test' ? options.allowlist ?? [] : [];
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProbeFailure('素材入口探测超过 10 秒')); }, TIMEOUT_MS);
      timer.unref?.();
    });
    const inspect = async (): Promise<CmsDeliveryObservation> => {
      response = await request(url.toString(), {
        method: 'GET', redirect: 'error', credentials: 'omit', timeout: TIMEOUT_MS, signal: controller.signal,
        retries: 0, circuitBreaker: false, ssrfProtection: true, ssrfAllowlist: allowlist,
        logBodyLimit: 0, httpLog: { level: 'access', logResponseBody: false },
      });
      if (controller.signal.aborted) {
        if (response.raw.body) void response.raw.body.cancel().catch(() => undefined);
        throw new ProbeFailure('素材入口探测已超时');
      }
      observation.httpStatus = response.status;
      // 素材正文始终不读取；只限制响应头大小，不用 HTML 正文上限误判较大的拒绝页。
      validateHeaders(response.headers, false);
      observation.cacheStatus = (response.headers.get('cache-status') ?? response.headers.get('cf-cache-status') ?? response.headers.get('x-cache') ?? response.headers.get('x-cache-status'))?.slice(0, 512) ?? null;
      observation.age = response.headers.get('age')?.slice(0, 64) ?? null;
      if (response.raw.redirected || (response.status >= 300 && response.status < 400)) throw new ProbeFailure('素材入口发生重定向，不能确认原始地址已拒绝访问');
      if ([403, 404, 410].includes(response.status)) return finish('passed', '素材入口已拒绝公开访问');
      return finish('failed', response.status >= 200 && response.status < 300 ? '素材入口仍可访问，撤权尚未在实际交付地址生效' : '素材入口返回异常状态，无法确认已拒绝公开访问');
    };
    return await Promise.race([inspect(), deadline]);
  } catch (error) {
    return finish('failed', error instanceof ProbeFailure ? error.message : controller.signal.aborted ? '素材入口探测超时' : '素材入口探测失败：网络、重定向或访问策略异常');
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    if (response?.raw.body && !response.raw.body.locked) void response.raw.body.cancel().catch(() => undefined);
  }
}
