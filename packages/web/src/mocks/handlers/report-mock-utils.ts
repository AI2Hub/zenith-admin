import { HttpResponse } from 'msw';

export const DEMO_USER_ID = 1;
export const DEMO_USER_NAME = '管理员';
export const DEMO_TENANT_ID: number | null = null;

export function reportOk<T>(data: T, message = 'ok') {
  return HttpResponse.json({ code: 0, message, data });
}

export function reportError(status: 400 | 403 | 404 | 409, message: string) {
  return HttpResponse.json({ code: status, message, data: null }, { status });
}

export function reportPage<T>(request: Request, source: T[]) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 20);
  return {
    list: source.slice((page - 1) * pageSize, page * pageSize),
    total: source.length,
    page,
    pageSize,
  };
}

export function matchesNumberParam(url: URL, key: string, value: number | null | undefined): boolean {
  const queryValue = url.searchParams.get(key);
  return !queryValue || Number(queryValue) === value;
}
