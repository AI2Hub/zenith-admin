import { useState } from 'react';
import { Form, Button, SideSheet } from '@douyinfe/semi-ui';
import { cmsVocabularyContract, type CmsVocabulary, type CreateCmsVocabularyInput } from '@zenith/shared/cms';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { EditFormModal } from '@/components/EditFormModal';
import { ListSearchToolbar, deleteAction } from '@/components/list-page';
import { CreateButton } from '@/components/toolbar-controls';
import { KeywordInput } from '@/components/search-filters';
import { useListPage } from '@/hooks/useListPage';
import { useEditModal } from '@/hooks/useEditModal';
import { usePermission } from '@/hooks/usePermission';
import { useAllCmsModels } from '@/hooks/queries/cms-models';
import { useCmsVocabularyList, useSaveCmsVocabulary, useDeleteCmsVocabularies } from '@/hooks/queries/cms-vocabularies';
import { CmsSiteSelect } from './CmsSiteSelect';
import TagsPage from './TagsPage';

export default function TaxonomyPage() {
  const [siteId, setSiteId] = useState<number>();
  const [selected, setSelected] = useState<CmsVocabulary>();
  const { hasPermission } = usePermission();
  const models = useAllCmsModels(siteId);
  const page = useListPage({ contract: cmsVocabularyContract, useList: useCmsVocabularyList, params: { siteId: siteId ?? 0 }, enabled: siteId !== undefined, table: { empty: '暂无受控词表' } });
  const save = useSaveCmsVocabulary(); const remove = useDeleteCmsVocabularies();
  const modal = useEditModal<CmsVocabulary, Partial<CreateCmsVocabularyInput>>({ entityName: '词表', save,
    toValues: row => ({ ...row, description: row.description ?? undefined }), beforeSave: (values, { isEdit }) => ({ ...values, ...(!isEdit ? { siteId } : {}) }),
  });
  return <div className="page-container">
    <ListSearchToolbar keyword={<><CmsSiteSelect value={siteId} onChange={value => { setSiteId(value); page.setPage(1); }} /><KeywordInput placeholder="搜索词表名称 / 编码" {...page.bindKeyword('keyword')} /></>}
      onSearch={page.toolbarProps.onSearch} onReset={page.toolbarProps.onReset} create={<CreateButton permission="cms:taxonomy:manage" onClick={modal.openCreate} />} />
    <ConfigurableTable<CmsVocabulary> {...page.tableProps} columns={[
      { title: '词表', dataIndex: 'name', minWidth: 160 }, { title: '编码', dataIndex: 'code', width: 130 },
      { title: '发布必选', dataIndex: 'required', width: 100, render: value => value ? '是' : '否' },
      { title: '最多选择', dataIndex: 'maxSelections', width: 100 }, { title: '状态', dataIndex: 'status', width: 100, render: value => value === 'enabled' ? '启用' : '停用' },
      createOperationColumn<CmsVocabulary>({ width: 200, desktopInlineKeys: ['terms', 'edit'], actions: row => [
        { key: 'terms', label: '词条', onClick: () => setSelected(row) },
        { key: 'edit', label: '编辑', hidden: !hasPermission('cms:taxonomy:manage'), onClick: () => modal.openEdit(row) },
        deleteAction({ hidden: !hasPermission('cms:taxonomy:manage'), title: '删除空词表？', run: () => remove.mutateAsync([row.id]) }),
      ] }),
    ]} />
    <EditFormModal modal={modal} width={640}>
      <Form.Input field="name" label="词表名称" rules={[{ required: true }]} />
      <Form.Input field="code" label="编码" rules={[{ required: true }]} placeholder="如 region、industry" />
      <Form.TextArea field="description" label="用途说明" />
      <Form.Select field="modelIds" label="适用内容模型" multiple optionList={(models.data ?? []).map(model => ({ value: model.id, label: model.name }))} extraText="留空适用于所有模型" />
      <Form.Switch field="required" label="发布必须选择" />
      <Form.InputNumber field="maxSelections" label="最多选择词条" initValue={10} min={1} max={100} />
      <Form.Select field="status" label="状态" initValue="enabled" optionList={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} />
    </EditFormModal>
    <SideSheet title={selected ? `${selected.name} · 分类词条` : '分类词条'} visible={!!selected} onCancel={() => setSelected(undefined)} width="min(1100px, 95vw)" footer={<Button onClick={() => setSelected(undefined)}>关闭</Button>}>
      {selected ? <TagsPage key={selected.id} vocabulary={selected} /> : null}
    </SideSheet>
  </div>;
}
