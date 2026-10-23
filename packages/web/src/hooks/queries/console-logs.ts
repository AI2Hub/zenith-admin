import type { QueryOf } from '@zenith/shared/core';
import { consoleLogContract, type ConsoleLogRole } from '@zenith/shared/ops';
import { contractKey, urlOf, useApiQuery } from '@/lib/contract-query';

export type ConsoleLogContentParams = Omit<NonNullable<QueryOf<typeof consoleLogContract.content>>, 'role'>;

export const consoleLogKeys = {
  sources: contractKey(consoleLogContract.sources),
  content: (role: ConsoleLogRole | undefined, params: ConsoleLogContentParams) =>
    contractKey(consoleLogContract.content, { query: { ...params, role } }),
};

/** 来源取自当前后端可访问的日志目录，不依赖服务管理器。 */
export function useConsoleLogSources() {
  return useApiQuery(consoleLogContract.sources, undefined, { staleTime: 0 });
}

export function useConsoleLogContent(role: ConsoleLogRole | undefined, params: ConsoleLogContentParams, enabled = true) {
  return useApiQuery(consoleLogContract.content, { query: { ...params, role } }, { enabled, staleTime: 0 });
}

export function consoleLogTailUrl(role: ConsoleLogRole) {
  return urlOf(consoleLogContract.tail, { query: { role } });
}
