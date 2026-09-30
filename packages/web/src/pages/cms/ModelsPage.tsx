import { Form, Tag, Tabs, Toast, Tooltip, Banner } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { useState, type CSSProperties } from 'react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createdAtColumn, renderEllipsis, renderEnabledStatusTag } from '@/utils/table-columns';
import { useEditModal } from '@/hooks/useEditModal';
import { useCmsModelList, useSaveCmsModel, useDeleteCmsModel, type CmsModelSaveValues } from '@/hooks/queries/cms-models';
import { cmsModelContract, validateCmsFieldDefinitions, type CmsModel } from '@zenith/shared/cms';
import { CreateButton } from '@/components/toolbar-controls';
import { CmsSiteSelect } from './CmsSiteSelect';
import { abortSubmit } from '@/lib/abort-submit';
import { KeywordInput } from '@/components/search-filters';
import { useCrudOperationColumn, ListSearchToolbar } from '@/components/list-page';
import { FormStatusRadioGroup } from '@/components/FormStatusRadioGroup';
import { useListPage } from '@/hooks/useListPage';
import { useUrlTabState } from '@/hooks/useUrlTabState';
import { useApiQuery } from '@/lib/contract-query';
import { EditFormSheet } from '@/components/EditFormModal';
import { CmsFieldDefinitionsEditor } from './ModelFieldRules';
import { serializeCmsModelFields, toCmsFieldEditorValues, type CmsFieldEditorValue } from './model-field-editor-values';
import { CmsModelPublishSheet } from './CmsSchemaPublishSheet';
import CmsComponentsPanel from './CmsComponentsPanel';

type ScopedModel = CmsModel & { scopeSiteId?: number };
function useModelEditorDetail(id: number | undefined, enabled = true, record?: ScopedModel) {
  return useApiQuery(cmsModelContract.detail, { params: { id: id ?? 0 }, query: { siteId: record?.scopeSiteId } }, { enabled: enabled && id !== undefined });
}

export default function ModelsPage() {
  const [siteId, setSiteId] = useState<number | undefined>();
  const [tab, setTab] = useUrlTabState(['models', 'components'] as const, 'models');
  const [publishing, setPublishing] = useState<CmsModel | null>(null);
  const page = useListPage({ contract: cmsModelContract, useList: useCmsModelList, params: { siteId }, enabled: siteId !== undefined && tab === 'models',
    table: { empty: siteId ? '暂无内容模型' : '请先选择站点' } });
  const saveMutation = useSaveCmsModel(siteId);
  const modal = useEditModal<ScopedModel, Record<string, unknown>, CmsModelSaveValues>({
    entityName: '模型', save: saveMutation, useDetail: useModelEditorDetail,
    defaults: { status: 'enabled', fields: [], ownerScope: 'site' },
    toValues: (record) => ({ name: record.name, code: record.code, description: record.description ?? '', status: record.status,
      ownerScope: record.ownerSiteId == null ? 'shared' : 'site', fields: toCmsFieldEditorValues(record.fields ?? []) }),
    beforeSave: (values) => {
      if (values.ownerScope !== 'shared' && !siteId) { Toast.warning('请先选择站点'); abortSubmit('validation'); }
      const fields = serializeCmsModelFields((values.fields ?? []) as CmsFieldEditorValue[]);
      const issues = validateCmsFieldDefinitions(fields);
      if (issues.length) { Toast.warning(`${issues[0].fieldPath}: ${issues[0].message}`); abortSubmit('validation'); }
      return { name: String(values.name), code: String(values.code), description: values.description ? String(values.description) : null,
        status: values.status as 'enabled' | 'disabled', ownerSiteId: values.ownerScope === 'shared' ? null : siteId!, fields };
    },
  });
  const deleteMutation = useDeleteCmsModel(siteId);
  const operationColumn = useCrudOperationColumn<CmsModel>({
    permission: 'cms:model', width: 220, desktopInlineKeys: ['edit', 'impact'],
    edit: row => modal.openEdit({ ...row, scopeSiteId: siteId }),
    remove: row => deleteMutation.mutateAsync(row.id),
    hidden: { remove: row => row.isSystem }, label: row => row.name,
    extraBetween: row => [{ key: 'impact', label: '发布影响', onClick: () => setPublishing(row) }],
  });
  const columns: ColumnProps<CmsModel>[] = [
    { title: '模型名称', dataIndex: 'name', width: 160, render: (value: string, record) => <span>{value}{record.isSystem && <Tag size="small" style={{ marginLeft: 6 }}>内置</Tag>}</span> },
    { title: '标识', dataIndex: 'code', width: 180, render: renderEllipsis },
    { title: '模型版本', dataIndex: 'hasUnpublishedChanges', width: 160, render: (_value, record) => <Tag color={record.hasUnpublishedChanges ? 'orange' : 'green'}>{record.publishedVersionId ? record.hasUnpublishedChanges ? '有待发布修改' : '已发布' : '尚未发布'}</Tag> },
    { title: '归属', dataIndex: 'ownerSiteId', width: 220, render: (_value, record) => {
      const text = record.ownerSiteId == null ? '平台共享' : record.ownerSiteName ?? `站点 #${record.ownerSiteId}`;
      return <Tooltip content={text} position="topLeft"><Tag size="small" color={record.ownerSiteId == null ? 'blue' : 'teal'} style={{ maxWidth: '100%' }}>{text}</Tag></Tooltip>;
    } },
    { title: '描述', dataIndex: 'description', minWidth: 220, render: renderEllipsis }, createdAtColumn,
    { title: '状态', dataIndex: 'status', width: 80, fixed: 'right', render: renderEnabledStatusTag },
    operationColumn,
  ];
  return <div className="page-container page-tabs-page">
    <Tabs activeKey={tab} onChange={(next) => setTab(next as 'models' | 'components')} collapsible="auto">
      <Tabs.TabPane tab="内容模型" itemKey="models">
        <ListSearchToolbar keyword={<><CmsSiteSelect value={siteId} onChange={(value) => { setSiteId(value); page.setPage(1); }} width={200} /><KeywordInput placeholder="搜索模型" {...page.bindKeyword('keyword')} /></>}
          onSearch={page.toolbarProps.onSearch} onReset={page.toolbarProps.onReset}
          create={<CreateButton permission="cms:model:create" onClick={modal.openCreate} disabled={!siteId} />} />
        <ConfigurableTable<CmsModel> columns={columns} {...page.tableProps} />
      </Tabs.TabPane>
      <Tabs.TabPane tab="可复用组件" itemKey="components">
        <div style={{ marginBottom: 16 }}><CmsSiteSelect value={siteId} onChange={setSiteId} width={200} /></div>
        <CmsComponentsPanel key={siteId ?? 'none'} siteId={siteId} />
      </Tabs.TabPane>
    </Tabs>
    <EditFormSheet modal={modal} width={980} header={<Banner type="info" description="先保存工作稿，再通过发布影响预览生成不可变模型版本。新内容使用发布版本，历史审核修订保留原定义。" />}>
      <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
        <Form.Input field="name" label="模型名称" maxLength={100} rules={[{ required: true, message: '请输入模型名称' }]} />
        <Form.Input field="code" label="模型标识" disabled={modal.isEdit} placeholder="如 article" maxLength={50} rules={[{ required: true, message: '请输入模型标识' }]} />
      </div>
      <Form.Input field="description" label="描述" maxLength={500} />
      <FormStatusRadioGroup />
      <Form.RadioGroup name="cms-definition-owner-scope" field="ownerScope" label="归属" disabled={modal.isEdit} extraText={modal.isEdit ? '归属创建后不可变更' : '专属模型仅当前站点可用；共享模型全部站点可用'}><Form.Radio value="site">当前站点专属</Form.Radio><Form.Radio value="shared">平台共享</Form.Radio></Form.RadioGroup>
      <Form.Section text="扩展字段（标题、摘要、正文、封面、作者已内置）"><CmsFieldDefinitionsEditor field="fields" siteId={siteId} root /></Form.Section>
    </EditFormSheet>
    <CmsModelPublishSheet model={publishing} siteId={siteId} onClose={() => setPublishing(null)} />
  </div>;
}
