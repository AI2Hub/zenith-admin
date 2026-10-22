import { useLayoutEffect, type ReactNode } from 'react';
import { useApprovalMultiSelectLayout } from '../lib/preferences';

/** 只在审批端已登录路由内应用；Portal 弹层同样受 body 标记控制。 */
export function ApprovalPreferencesBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const layout = useApprovalMultiSelectLayout();
  useLayoutEffect(() => {
    document.body.dataset.multiSelectLayout = layout;
    return () => { delete document.body.dataset.multiSelectLayout; };
  }, [layout]);
  return children;
}
