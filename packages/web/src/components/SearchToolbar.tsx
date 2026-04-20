import type { ReactNode } from 'react';
import { Space } from '@douyinfe/semi-ui';

interface SearchToolbarProps {
  /** 工具栏内容（搜索输入框、下拉筛选、按钮等），自动用 `<Space wrap>` 包裹 */
  readonly children?: ReactNode;
  /** 附加 CSS 类名，附加到外层容器 */
  readonly className?: string;
}

export function SearchToolbar({ children, className }: SearchToolbarProps) {
  return (
    <div className="search-area">
      <div className={className ? `responsive-toolbar ${className}` : 'responsive-toolbar'}>
        <Space wrap>{children}</Space>
      </div>
    </div>
  );
}
