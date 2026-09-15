import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from '@/lib/contract-query';

const SignatureClientContext = createContext<ApiClient | undefined>(undefined);

/** 签名组件跟随所在入口的会话；审批端在页面的懒加载边界内提供自己的客户端。 */
export function SignatureClientProvider({ client, children }: Readonly<{ client: ApiClient; children: ReactNode }>) {
  return <SignatureClientContext.Provider value={client}>{children}</SignatureClientContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- 与签名客户端 Context 同源的轻量读取 hook
export function useSignatureClient() {
  return useContext(SignatureClientContext);
}
