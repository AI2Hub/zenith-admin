import { HttpResponse } from 'msw';

/**
 * MSW handler 的统一响应构造。
 *
 * 返回后端约定的 `{ code, message, data }` 信封，并透传可选的 `ResponseInit`。
 * 业务 `code` 不决定 HTTP 状态码：调用点需显式传入，如 `notFound('标签不存在', { status: 404 })`。
 * HTTP 401/429/503 会被 http-client 特殊拦截，须保留各 handler 的状态码语义，不能自动统一。
 */

/** 成功响应。`data` 省略时响应体不含 `data` 字段。 */
export function ok<T>(data?: T, message = 'ok', init?: ResponseInit) {
  return HttpResponse.json({ code: 0, message, data }, init);
}

/** 失败响应，`data` 固定为 `null`。 */
export function fail(code: number, message: string, init?: ResponseInit) {
  return HttpResponse.json({ code, message, data: null }, init);
}

export const badRequest = (message: string, init?: ResponseInit) => fail(400, message, init);
export const unauthorized = (message: string, init?: ResponseInit) => fail(401, message, init);
export const forbidden = (message: string, init?: ResponseInit) => fail(403, message, init);
export const notFound = (message = '不存在', init?: ResponseInit) => fail(404, message, init);
export const conflict = (message: string, init?: ResponseInit) => fail(409, message, init);
export const locked = (message: string, init?: ResponseInit) => fail(423, message, init);

/** 从 query string 解析分页参数。默认页大小按各 handler 原值传入，勿统一。 */
export function pageParams(url: URL, defaultPageSize = 10) {
  return {
    page: Number(url.searchParams.get('page')) || 1,
    pageSize: Number(url.searchParams.get('pageSize')) || defaultPageSize,
  };
}

/** 已知 page/pageSize 时的分页响应体（页码来自 query 之外的来源时用这个）。 */
export function pageResult<T>(list: T[], page: number, pageSize: number) {
  return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
}

/** 按 query string 的 page/pageSize 切片，返回后端约定的分页响应体。 */
export function paginate<T>(list: T[], url: URL, defaultPageSize = 10) {
  const { page, pageSize } = pageParams(url, defaultPageSize);
  return pageResult(list, page, pageSize);
}

/**
 * 由现有列表推出下一个自增 ID。空列表返回 1
 * （内联写法 `Math.max(...list.map(...)) + 1` 在空列表时会得到 `-Infinity`）。
 *
 * 取名 `nextIdFrom` 而非 `nextId`，是因为不少 mock 数据文件里已有模块级的
 * `let nextId = ...` 计数器变量，同名会互相遮蔽。
 */
export function nextIdFrom<T extends { id: number }>(list: readonly T[]): number {
  return list.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
}
