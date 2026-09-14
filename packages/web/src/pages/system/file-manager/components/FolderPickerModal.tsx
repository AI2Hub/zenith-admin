/** 文件夹选择器（移动/复制目标）：面包屑 + 子文件夹下钻 + Windows 盘符切换 */
import { useEffect, useState } from 'react';
import { Breadcrumb, Button, Spin, Typography } from '@douyinfe/semi-ui';
import { ArrowUp } from 'lucide-react';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import AppModal from '@/components/AppModal';
import { getFolderIcon } from '@/utils/fileIcons';
import { useTerminalPickerList } from '@/hooks/queries/terminal-files';
import { buildBreadcrumbs } from '../fs-utils';

interface FolderPickerModalProps {
  readonly visible: boolean;
  readonly title: string;
  readonly initialPath: string;
  /** Windows 盘符列表（如 ['C:', 'D:'])，为空则不显示盘符切换 */
  readonly drives?: string[];
  readonly onConfirm: (destDir: string) => void;
  readonly onCancel: () => void;
}

export default function FolderPickerModal({ visible, title, initialPath, drives = [], onConfirm, onCancel }: Readonly<FolderPickerModalProps>) {
  const [pickerPath, setPickerPath] = useState('');
  const [initialized, setInitialized] = useState(false);
  const pickerQuery = useTerminalPickerList(pickerPath, visible && initialized);

  useEffect(() => {
    if (visible && !initialized) {
      setPickerPath(initialPath || '/');
      setInitialized(true);
    }
    if (!visible) setInitialized(false);
  }, [visible, initialPath, initialized]);

  useEffect(() => {
    if (pickerQuery.data?.path && pickerQuery.data.path !== pickerPath) {
      setPickerPath(pickerQuery.data.path);
    }
  }, [pickerPath, pickerQuery.data]);

  const loadPickerDir = (path: string) => setPickerPath(path);
  const pickerParent = pickerQuery.data?.parent ?? null;
  const pickerFolders = pickerQuery.data?.entries.filter((e) => e.type === 'dir').map((e) => ({ name: e.name, path: e.path })) ?? [];
  const pickerLoading = pickerQuery.isFetching;
  const pickerBreadcrumbs = pickerPath ? buildBreadcrumbs(pickerPath) : [];
  const folderPickerOkText = title.includes('移') ? '移动到此处' : '复制到此处';

  return (
    <AppModal
      title={title}
      visible={visible}
      onCancel={onCancel}
      onOk={() => onConfirm(pickerPath)}
      okText={folderPickerOkText}
      closeOnEsc
      width={480}
      okButtonProps={{ disabled: !pickerPath }}
      fullscreenable={false}
    >
      {/* 面包屑导航 */}
      <Breadcrumb style={{ marginBottom: 8 }}>
        {pickerBreadcrumbs.map((seg, i) => (
          <Breadcrumb.Item
            key={seg.path}
            onClick={i < pickerBreadcrumbs.length - 1 ? () => void loadPickerDir(seg.path) : undefined}
            style={{ cursor: i < pickerBreadcrumbs.length - 1 ? 'pointer' : 'default', color: i < pickerBreadcrumbs.length - 1 ? 'var(--semi-color-primary)' : undefined }}
          >
            {seg.label}
          </Breadcrumb.Item>
        ))}
      </Breadcrumb>

      {/* 文件夹列表（无卡片边框，简洁风格） */}
      <div style={{ height: 280, overflowY: 'auto', background: 'var(--semi-color-fill-0)', borderRadius: 'var(--semi-border-radius-medium)' }}>
        {pickerLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="middle" />
          </div>
        ) : (
          <>
            {pickerParent !== null && (
              <button
                type="button"
                onClick={() => void loadPickerDir(pickerParent)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--semi-color-border)', cursor: 'pointer', color: 'var(--semi-color-text-2)', font: 'inherit', fontSize: 13 }}
              >
                <ArrowUp size={15} />
                <span>上级目录</span>
              </button>
            )}
            {/* Windows 盘符切换：到达盘符根目录时显示 */}
            {pickerParent === null && drives.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--semi-color-border)' }}>
                {drives.map((d) => {
                  const isActive = pickerPath.toUpperCase().startsWith(d.toUpperCase());
                  return (
                    <Button
                      key={d}
                      size="small"
                      theme={isActive ? 'solid' : 'light'}
                      type={isActive ? 'primary' : 'tertiary'}
                      onClick={() => void loadPickerDir(d + '\\')}
                    >
                      {d}
                    </Button>
                  );
                })}
              </div>
            )}
            {pickerFolders.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--semi-color-text-2)', fontSize: 13 }}>
                当前目录无子文件夹
              </div>
            ) : (
              pickerFolders.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => void loadPickerDir(f.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--semi-color-fill-0)', cursor: 'pointer', color: 'var(--semi-color-text-0)', font: 'inherit', fontSize: 13 }}
                >
                  <FileTypeIcon icon={getFolderIcon(f.name, false)} size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{f.name}</span>
                </button>
              ))
            )}
          </>
        )}
      </div>

      <Typography.Text size="small" type="tertiary" style={{ display: 'block', marginTop: 8 }}>
        目标目录：{pickerPath}
      </Typography.Text>
    </AppModal>
  );
}
