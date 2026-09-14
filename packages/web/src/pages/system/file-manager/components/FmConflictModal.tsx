/** 同名冲突处理选择框：覆盖 / 跳过 / 保留两者，关闭视为取消（resolve null） */
import { Button, Modal, Typography } from '@douyinfe/semi-ui';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { getFileIcon } from '@/utils/fileIcons';
import type { ConflictResolution } from '../types';

interface FmConflictModalProps {
  readonly conflict: { names: string[] } | null;
  readonly onSettle: (r: ConflictResolution | null) => void;
}

export default function FmConflictModal({ conflict, onSettle }: Readonly<FmConflictModalProps>) {
  return (
    <Modal
      title={`目标目录已存在 ${conflict?.names.length ?? 0} 个同名项`}
      visible={!!conflict}
      onCancel={() => onSettle(null)}
      closeOnEsc
      width={440}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="tertiary" onClick={() => onSettle('skip')}>跳过</Button>
          <Button onClick={() => onSettle('keep-both')}>保留两者</Button>
          <Button type="danger" theme="solid" onClick={() => onSettle('overwrite')}>覆盖</Button>
        </div>
      }
    >
      <Typography.Text type="tertiary" size="small" style={{ display: 'block', marginBottom: 8 }}>
        「跳过」不处理这些项；「保留两者」以「xxx - 副本」命名；「覆盖」将替换目标位置的同名文件（不可恢复）。
      </Typography.Text>
      <div style={{ maxHeight: 200, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(conflict?.names ?? []).map((n) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <FileTypeIcon icon={getFileIcon(n)} size={14} />
            <Typography.Text ellipsis={{ showTooltip: true }} style={{ fontSize: 13 }}>{n}</Typography.Text>
          </div>
        ))}
      </div>
    </Modal>
  );
}
