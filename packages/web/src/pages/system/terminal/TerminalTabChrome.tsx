import type { CSSProperties } from 'react';
import { Button, Tooltip } from '@douyinfe/semi-ui';
import { Package, PanelLeft, Server } from 'lucide-react';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { getFileIcon, getShellIcon } from '@/utils/fileIcons';
import type { PaneLeaf } from './paneTree';

export type TerminalPanelKey = 'explorer' | 'ssh' | 'docker';
type TooltipPosition = 'top' | 'topLeft' | 'topRight' | 'left' | 'leftTop' | 'leftBottom' | 'right' | 'rightTop' | 'rightBottom' | 'bottom' | 'bottomLeft' | 'bottomRight';

const TERMINAL_PANELS = {
  explorer: { icon: PanelLeft, show: '显示文件浏览器', hide: '隐藏文件浏览器' },
  ssh: { icon: Server, show: '管理 SSH 连接', hide: '隐藏 SSH 连接' },
  docker: { icon: Package, show: '浏览 Docker 容器', hide: '隐藏 Docker 容器' },
};

export function TerminalPanelButton({ panel, activePanel, onToggle, tooltipPosition, style }: {
  panel: TerminalPanelKey; activePanel: TerminalPanelKey | null; onToggle: (panel: TerminalPanelKey) => void; tooltipPosition?: TooltipPosition; style?: CSSProperties;
}) {
  const config = TERMINAL_PANELS[panel];
  const active = activePanel === panel;
  const PanelIcon = config.icon;
  return (
    <Tooltip content={active ? config.hide : config.show} position={tooltipPosition}>
      <Button icon={<PanelIcon size={14} />} size="small" theme="borderless" type={active ? 'primary' : 'tertiary'} onClick={() => onToggle(panel)} style={style} />
    </Tooltip>
  );
}

export function TerminalTabIcon({ leaf, size }: { leaf: PaneLeaf; size: number }) {
  return leaf.kind === 'editor'
    ? <FileTypeIcon icon={getFileIcon(leaf.title)} size={size} />
    : <FileTypeIcon icon={getShellIcon(leaf.shell)} size={size} />;
}
