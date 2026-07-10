import type { ReactNode } from 'react';
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';

export interface MobileDashboardAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface MobileDashboardHeaderProps {
  title: string;
  dark?: boolean;
  onBack?: () => void;
  filter?: ReactNode;
  actions?: MobileDashboardAction[];
}

export function MobileDashboardHeader({
  title,
  dark = false,
  onBack,
  filter,
  actions = [],
}: Readonly<MobileDashboardHeaderProps>) {
  return (
    <div className={`report-mobile-header${dark ? ' report-mobile-header--dark' : ''}`}>
      {onBack ? (
        <Button
          theme="borderless"
          icon={<ArrowLeft size={18} />}
          onClick={onBack}
          aria-label="返回仪表盘列表"
        />
      ) : null}
      <h1 className="report-mobile-header__title">{title}</h1>
      {filter}
      {actions.length > 0 ? (
        <Dropdown
          trigger="click"
          clickToHide
          position="bottomRight"
          getPopupContainer={() => document.body}
          render={(
            <Dropdown.Menu>
              {actions.map((action) => (
                <Dropdown.Item
                  key={action.key}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  <span className="report-mobile-header__action">
                    {action.icon}
                    <span>{action.label}</span>
                  </span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          )}
        >
          <Button theme="borderless" icon={<MoreHorizontal size={18} />} aria-label="更多操作" />
        </Dropdown>
      ) : null}
    </div>
  );
}

export default MobileDashboardHeader;
