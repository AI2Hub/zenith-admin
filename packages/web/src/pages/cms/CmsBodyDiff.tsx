import { Banner, Button, Divider, Space, Tag, Typography } from '@douyinfe/semi-ui';
import type { CmsDocumentBlockDiff } from '@zenith/shared/cms';
import CmsValueDiff from './CmsValueDiff';

const labels = { added: '新增段落', removed: '删除段落', changed: '修改段落', moved: '移动段落' };
export default function CmsBodyDiff({ changes, onLocate }: Readonly<{ changes: CmsDocumentBlockDiff[]; onLocate?: (nodeId: string) => void }>) {
  return <Space vertical align="start" style={{ width: '100%' }}>
    {changes.map((change) => <section key={change.id} style={{ width: '100%' }}>
      <Space wrap><Tag color={change.kind === 'removed' ? 'red' : change.kind === 'added' ? 'green' : 'orange'}>{labels[change.kind]}</Tag>
        <Typography.Text type="tertiary">{change.beforeIndex === null ? '历史修订无此段落' : `历史第 ${change.beforeIndex + 1} 段`} → {change.afterIndex === null ? '当前已删除' : `当前第 ${change.afterIndex + 1} 段`}</Typography.Text>
        {change.afterIndex !== null && onLocate && <Button size="small" theme="borderless" onClick={() => onLocate(change.id)}>定位当前段落</Button>}
      </Space>
      {change.kind === 'changed' && change.before === change.after && <Banner type="info" description="此段落文字相同，排版、结构或媒体发生了变化。" />}
      <CmsValueDiff before={change.before} after={change.after} />
      <Divider margin={12} />
    </section>)}
  </Space>;
}
