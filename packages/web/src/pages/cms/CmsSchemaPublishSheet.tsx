import { Banner, Descriptions, SideSheet, Space, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { CmsComponentListItem, CmsModel, CmsModelFieldChange } from '@zenith/shared/cms';
import ConfigurableTable from '@/components/ConfigurableTable';
import { ModalFooter } from '@/components/ModalFooter';
import { useCmsModelPublishImpact, usePublishCmsModel } from '@/hooks/queries/cms-models';
import { useCmsComponentImpact, usePublishCmsComponent } from '@/hooks/queries/cms-components';
import { usePermission } from '@/hooks/usePermission';

const CHANGE_LABELS = { added: '新增', removed: '删除', type_changed: '类型变化', changed: '规则变化' };

function Changes({ changes, breaking }: Readonly<{ changes: CmsModelFieldChange[]; breaking: boolean }>) {
  return <Space vertical align="start" style={{ width: '100%' }}>
    {breaking ? <Banner type="warning" description="存在结构或必填规则变化。发布后，新工作稿按新定义校验；已有修订仍使用原版本。" /> : null}
    {/* Space 是 inline-flex 且无 stretch 选项：表格直放会被按内容收缩（空表只剩表头宽），外套 width: 100% 的块级容器才能占满整行 */}
    <div style={{ width: '100%' }}>
      <ConfigurableTable<CmsModelFieldChange> rowKey="path" pagination={false} dataSource={changes}
        columns={[{ title: '字段路径', dataIndex: 'path', minWidth: 180 }, { title: '变更', dataIndex: 'kind', width: 100, render: (value: CmsModelFieldChange['kind']) => <Tag>{CHANGE_LABELS[value]}</Tag> }, { title: '原类型', dataIndex: 'beforeType', width: 120 }, { title: '新类型', dataIndex: 'afterType', width: 120 }]} />
    </div>
  </Space>;
}

export function CmsModelPublishSheet({ model, siteId, onClose }: Readonly<{ model: CmsModel | null; siteId?: number; onClose: () => void }>) {
  const query = useCmsModelPublishImpact(model?.id, siteId);
  const publish = usePublishCmsModel();
  const { hasPermission } = usePermission();
  return <SideSheet title={`模型发布影响 · ${model?.name ?? ''}`} visible={model !== null} width={760} onCancel={onClose}
    footer={<ModalFooter onCancel={onClose} okText="发布模型版本" loading={publish.isPending}
      disabled={!query.data || query.isFetching || !model?.hasUnpublishedChanges || !hasPermission('cms:model:update')}
      onOk={() => { if (model) publish.mutate({ params: { id: model.id }, query: { siteId } }, { onSuccess: () => { Toast.success('模型版本已发布'); onClose(); } }); }} />}>
    <Spin spinning={query.isFetching}>
      {query.isError && <Banner type="danger" description="影响分析加载失败，请关闭后重试。" />}
      {query.data && <>
        <Descriptions data={[
          { key: '工作稿', value: query.data.affected.workingCopies }, { key: '已发布内容', value: query.data.affected.publishedContents },
          { key: '引用栏目', value: query.data.affected.channels }, { key: '引用站点', value: query.data.affected.sites },
        ]} />
        <Changes changes={query.data.changes} breaking={query.data.breaking} />
      </>}
    </Spin>
  </SideSheet>;
}

export function CmsComponentPublishSheet({ component, siteId, onClose }: Readonly<{ component: CmsComponentListItem | null; siteId?: number; onClose: () => void }>) {
  const query = useCmsComponentImpact(component?.id, siteId);
  const publish = usePublishCmsComponent();
  const { hasPermission } = usePermission();
  return <SideSheet title={`组件发布影响 · ${component?.name ?? ''}`} visible={component !== null} width={760} onCancel={onClose}
    footer={<ModalFooter onCancel={onClose} okText="发布组件版本" loading={publish.isPending}
      disabled={!query.data || query.isFetching || !component?.hasUnpublishedChanges || !hasPermission('cms:model:update')}
      onOk={() => { if (component) publish.mutate({ params: { id: component.id }, query: { siteId }, body: { expectedVersion: component.version } }, { onSuccess: () => { Toast.success('组件版本已发布'); onClose(); } }); }} />}>
    <Spin spinning={query.isFetching}>
      {query.isError && <Banner type="danger" description="影响分析加载失败，请关闭后重试。" />}
      {query.data && <>
        <Changes changes={query.data.changes} breaking={query.data.breaking} />
        <Typography.Title heading={6}>引用此组件的模型</Typography.Title>
        <Typography.Paragraph type="tertiary">新组件版本发布后，以下模型须明确选用新版本。线上模型不会被自动替换。</Typography.Paragraph>
        <ConfigurableTable pagination={false} rowKey="id" dataSource={query.data.models} columns={[
          { title: '模型', dataIndex: 'name', minWidth: 160 }, { title: '使用范围', dataIndex: 'workingCopy', width: 200, render: (_value, record) => <Space>{record.workingCopy && <Tag>工作稿</Tag>}{record.publishedVersion && <Tag>发布版本</Tag>}</Space> },
        ]} />
      </>}
    </Spin>
  </SideSheet>;
}
