import { QueryClient } from '@tanstack/react-query';

/** 审批入口只装配缓存容器，业务查询与契约随具体页面加载。 */
export const approvalQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 },
  },
});
