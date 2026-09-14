/** 深度搜索结果弹窗：递归搜索当前目录，支持「前往」定位（文件高亮所在目录） */
import { Banner, Button, Modal, Typography } from '@douyinfe/semi-ui';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { getFileIcon, getFolderIcon } from '@/utils/fileIcons';
import { searchResultTitle } from '../fs-utils';
import type { FsEntry } from '../types';

interface FmSearchModalProps {
  readonly visible: boolean;
  readonly dir: string;
  readonly keyword: string;
  readonly searching: boolean;
  readonly results: FsEntry[] | null;
  /** 结果因触顶提前结束；不提示会让用户把「没搜完」当成「不存在」 */
  readonly truncated?: boolean;
  readonly onClose: () => void;
  readonly onGoto: (entry: FsEntry) => void;
}

export default function FmSearchModal({ visible, dir, keyword, searching, results, truncated, onClose, onGoto }: Readonly<FmSearchModalProps>) {
  return (
    <Modal
      title={searchResultTitle(results)}
      visible={visible}
      onCancel={onClose}
      footer={null}
      closeOnEsc
      width={620}
    >
      <Typography.Text type="tertiary" size="small" style={{ display: 'block', marginBottom: 8 }}>
        在 {dir || '/'} 下递归搜索「{keyword}」{searching ? ' · 搜索中…' : ''}
      </Typography.Text>
      {truncated && !searching && (
        <Banner
          type="warning"
          closeIcon={null}
          style={{ marginBottom: 8 }}
          description="结果已达上限，未搜索完整个目录树。请缩小搜索范围或使用更精确的关键词。"
        />
      )}
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        {(results ?? []).length === 0 && !searching && (
          <Typography.Text type="tertiary">未找到匹配项</Typography.Text>
        )}
        {(results ?? []).map((r) => (
          <div key={r.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px', borderBottom: '1px solid var(--semi-color-fill-1)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileTypeIcon icon={r.type === 'dir' ? getFolderIcon(r.name, false) : getFileIcon(r.name)} size={14} />
                {r.name}
              </div>
              <Typography.Text type="tertiary" size="small" ellipsis={{ showTooltip: true }} style={{ maxWidth: 420, display: 'block' }}>{r.path}</Typography.Text>
            </div>
            <Button size="small" theme="borderless" onClick={() => onGoto(r)}>前往</Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
