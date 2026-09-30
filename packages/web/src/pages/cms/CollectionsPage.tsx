import { useState } from 'react';
import { Banner, Form, SideSheet, Space, Typography, withField } from '@douyinfe/semi-ui';
import { cmsContentCollectionContract, cmsCollectionDefinitionSchema, type CmsContentCollection, type CreateCmsCollectionInput } from '@zenith/shared/cms';
import { usePermission } from '@/hooks/usePermission';
import { useListPage } from '@/hooks/useListPage';
import { useEditModal } from '@/hooks/useEditModal';
import { useAllCmsModels } from '@/hooks/queries/cms-models';
import { useAllCmsTags } from '@/hooks/queries/cms-tags';
import { useCmsChannelTree } from '@/hooks/queries/cms-channels';
import { useCmsCollectionList, useSaveCmsCollection, useDeleteCmsCollections, useCmsCollectionPreview, useCmsCollectionVersions } from '@/hooks/queries/cms-content-collections';
import ConfigurableTable from '@/components/ConfigurableTable';
import { EditFormModal } from '@/components/EditFormModal';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { ListSearchToolbar, deleteAction } from '@/components/list-page';
import { CreateButton } from '@/components/toolbar-controls';
import { KeywordInput } from '@/components/search-filters';
import { CmsSiteSelect } from './CmsSiteSelect';
import CmsContentReferenceInput from './CmsContentReferenceInput';
import { flattenChannels } from './channel-tree';
import CmsCollectionFilters from './CmsCollectionFilters';

const ContentInput = withField(CmsContentReferenceInput);
const FilterInput = withField(CmsCollectionFilters);
type Values = Partial<CreateCmsCollectionInput> & { expectedVersion?: number };
export default function CollectionsPage() {
  const [siteId, setSiteId] = useState<number>(); const [previewId, setPreviewId] = useState<number>();
  const [editingModelId, setEditingModelId] = useState<number | null>();
  const { hasPermission } = usePermission();
  const models = useAllCmsModels(siteId); const tags = useAllCmsTags(siteId); const channels = useCmsChannelTree(siteId);
  const page = useListPage({ contract: cmsContentCollectionContract, useList: useCmsCollectionList, params: { siteId: siteId ?? 0 }, enabled: !!siteId, table: { empty: '暂无内容集合' } });
  const save = useSaveCmsCollection(); const remove = useDeleteCmsCollections();
  const preview = useCmsCollectionPreview(previewId); const versions = useCmsCollectionVersions(previewId);
  const modal = useEditModal<CmsContentCollection, Values>({ entityName: '内容集合', save,
    toValues: row => ({ ...row, description: row.description ?? undefined, expectedVersion: row.version }),
    beforeSave: (values, { isEdit }) => ({ ...values, definition: cmsCollectionDefinitionSchema.parse({ ...values.definition, sortField: values.definition?.sortField || null, locale: values.definition?.locale || null }), ...(!isEdit ? { siteId } : {}) }),
  });
  return <div className="page-container">
    <ListSearchToolbar keyword={<><CmsSiteSelect value={siteId} onChange={value => { setSiteId(value); page.setPage(1); }} /><KeywordInput {...page.bindKeyword('keyword')} placeholder="搜索集合名称 / 编码" /></>}
      onSearch={page.toolbarProps.onSearch} onReset={page.toolbarProps.onReset} create={<CreateButton permission="cms:collection:manage" onClick={modal.openCreate} />} />
    <ConfigurableTable<CmsContentCollection> {...page.tableProps} columns={[
      { title: '集合名称', dataIndex: 'name', minWidth: 180 }, { title: '编码', dataIndex: 'code', width: 130 }, { title: '版本', dataIndex: 'version', width: 80 },
      { title: '条数', width: 80, render: (_, row) => row.definition.limit },
      createOperationColumn<CmsContentCollection>({ width: 190, desktopInlineKeys: ['preview', 'edit'], actions: row => [
        { key: 'preview', label: '预览', onClick: () => setPreviewId(row.id) }, { key: 'edit', label: '编辑', hidden: !hasPermission('cms:collection:manage'), onClick: () => modal.openEdit(row) },
        deleteAction({ hidden: !hasPermission('cms:collection:manage'), title: '删除未引用的内容集合？', run: () => remove.mutateAsync([row.id]) }),
      ] }),
    ]} />
    <EditFormModal modal={modal} width={780}>
      <Banner type="info" description="保存后生成定义版本；通过站点配置发布单上线。集合只选取有效的已发布内容，固定项优先，排除项始终不展示。" />
      <Form.Input field="name" label="集合名称" rules={[{ required: true }]} /><Form.Input field="code" label="编码" rules={[{ required: true }]} />
      <Form.TextArea field="description" label="用途说明" />
      <Form.Select field="definition.modelId" label="内容模型" showClear optionList={(models.data ?? []).map(row => ({ value: row.id, label: row.name }))} onChange={value => setEditingModelId(value ? Number(value) : null)} />
      <FilterInput field="definition.filters" label="模型字段条件（全部满足）" fields={models.data?.find(model => model.id === (editingModelId === undefined ? modal.editing?.definition.modelId : editingModelId))?.fields ?? []} />
      <Form.Select field="definition.channelIds" label="栏目范围" multiple optionList={flattenChannels(channels.data ?? []).map(row => ({ value: row.id, label: row.name }))} />
      <Form.Select field="definition.tagIds" label="全部匹配的分类 / 标签" multiple filter optionList={(tags.data ?? []).map(row => ({ value: row.id, label: row.name }))} />
      <Form.Input field="definition.locale" label="语言" placeholder="如 zh-CN，留空不限制" />
      <Form.Select field="definition.sort" label="排序" initValue="publishedAt" optionList={[{ value: 'publishedAt', label: '发布时间' }, { value: 'title', label: '标题' }, { value: 'field', label: '模型字段' }]} />
      <Form.Input field="definition.sortField" label="模型排序字段" placeholder="例如 start_date" />
      <Form.Select field="definition.direction" label="顺序" initValue="desc" optionList={[{ value: 'asc', label: '升序' }, { value: 'desc', label: '降序' }]} />
      <Form.InputNumber field="definition.limit" label="最多条数" initValue={12} min={1} max={100} />
      <ContentInput field="definition.pinnedIds" label="人工固定内容（按选择顺序）" siteId={siteId} multiple />
      <ContentInput field="definition.excludedIds" label="排除内容" siteId={siteId} multiple />
    </EditFormModal>
    <SideSheet title="集合预览与版本" visible={!!previewId} onCancel={() => setPreviewId(undefined)} width={720}>
      <Space vertical align="start" style={{ width: '100%' }}>
        <Typography.Text>当前规则 v{preview.data?.version} · 按已发布内容预览</Typography.Text>
        {preview.error ? <Banner type="danger" description="集合预览失败，请检查规则和权限" /> : null}
        {preview.data?.items.map((item, index) => <Typography.Paragraph key={item.id}>{index + 1}. {item.title} · {item.reason}</Typography.Paragraph>)}
        {!preview.isLoading && !preview.data?.items.length ? <Typography.Text type="secondary">暂无匹配内容</Typography.Text> : null}
        <Typography.Title heading={6}>定义版本</Typography.Title>
        {versions.data?.map(row => <Typography.Paragraph key={row.version}>v{row.version} · {row.name} · {row.createdAt}</Typography.Paragraph>)}
      </Space>
    </SideSheet>
  </div>;
}
