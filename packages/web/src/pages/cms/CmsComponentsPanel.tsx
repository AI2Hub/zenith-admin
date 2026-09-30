import { useState, type CSSProperties } from 'react';
import { Form, Tag, Toast } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { cmsComponentContract, validateCmsFieldDefinitions, type CmsComponent, type CmsComponentListItem } from '@zenith/shared/cms';
import ConfigurableTable from '@/components/ConfigurableTable';
import { EditFormSheet } from '@/components/EditFormModal';
import { FormStatusRadioGroup } from '@/components/FormStatusRadioGroup';
import { CreateButton } from '@/components/toolbar-controls';
import { useCrudOperationColumn, ListSearchToolbar } from '@/components/list-page';
import { useEditModal } from '@/hooks/useEditModal';
import { useListPage } from '@/hooks/useListPage';
import { useCmsComponentDetail, useCmsComponentList, useDeleteCmsComponent, useSaveCmsComponent, type CmsComponentSaveValues } from '@/hooks/queries/cms-components';
import { abortSubmit } from '@/lib/abort-submit';
import { createdAtColumn, renderEllipsis } from '@/utils/table-columns';
import { CmsFieldDefinitionsEditor } from './ModelFieldRules';
import { serializeCmsComponentFields, toCmsFieldEditorValues, type CmsFieldEditorValue } from './model-field-editor-values';
import { CmsComponentPublishSheet } from './CmsSchemaPublishSheet';

type ComponentEditorRecord = CmsComponentListItem & Partial<Pick<CmsComponent, 'fields'>>;

export default function CmsComponentsPanel({ siteId }: Readonly<{ siteId?: number }>) {
  const [publishing, setPublishing] = useState<CmsComponentListItem | null>(null);
  const page = useListPage({ contract: cmsComponentContract, useList: useCmsComponentList, params: { siteId }, enabled: siteId !== undefined,
    table: { empty: siteId ? '暂无可复用组件' : '请先选择站点' } });
  const save = useSaveCmsComponent();
  const remove = useDeleteCmsComponent();
  const modal = useEditModal<ComponentEditorRecord, Record<string, unknown>, CmsComponentSaveValues>({
    entityName: '内容组件', save, useDetail: useCmsComponentDetail,
    defaults: { status: 'enabled', ownerScope: 'site', fields: [] },
    toValues: (record) => ({ name: record.name, code: record.code, description: record.description, status: record.status,
      ownerScope: record.ownerSiteId == null ? 'shared' : 'site', fields: toCmsFieldEditorValues(record.fields ?? []) }),
    beforeSave: (values, { editing }) => {
      const fields = serializeCmsComponentFields((values.fields ?? []) as CmsFieldEditorValue[]);
      const issues = validateCmsFieldDefinitions(fields);
      if (issues.length) { Toast.warning(`${issues[0].fieldPath}: ${issues[0].message}`); abortSubmit('validation'); }
      return { name: String(values.name), code: String(values.code), description: values.description ? String(values.description) : null,
        status: values.status as 'enabled' | 'disabled', ownerSiteId: values.ownerScope === 'shared' ? null : siteId,
        fields, ...(editing ? { expectedVersion: editing.version } : {}) };
    },
  });
  const operationColumn = useCrudOperationColumn<CmsComponentListItem>({
    permission: 'cms:model', width: 220, desktopInlineKeys: ['edit', 'impact'],
    edit: row => modal.openEdit(row),
    remove: row => remove.mutateAsync(row.id),
    hidden: { remove: row => !!row.publishedVersionId }, label: row => row.name,
    extraBetween: row => [{ key: 'impact', label: '发布影响', onClick: () => setPublishing(row) }],
  });
  const columns: ColumnProps<CmsComponentListItem>[] = [
    { title: '组件名称', dataIndex: 'name', width: 180 },
    { title: '标识', dataIndex: 'code', width: 160, render: renderEllipsis },
    { title: '归属', dataIndex: 'ownerSiteName', width: 200, render: (_value, record) => renderEllipsis(record.ownerSiteId == null ? '平台共享' : record.ownerSiteName) },
    { title: '版本状态', dataIndex: 'hasUnpublishedChanges', width: 160, render: (_value, record) => <Tag color={record.hasUnpublishedChanges ? 'orange' : 'green'}>{record.publishedVersionId ? record.hasUnpublishedChanges ? '有待发布修改' : '已发布' : '尚未发布'}</Tag> },
    { title: '描述', dataIndex: 'description', render: renderEllipsis },
    createdAtColumn,
    operationColumn,
  ];
  return <>
    <ListSearchToolbar page={page} filters={['keyword', 'status']} create={<CreateButton permission="cms:model:create" disabled={!siteId} onClick={modal.openCreate} />} />
    <ConfigurableTable<CmsComponentListItem> columns={columns} {...page.tableProps} />
    <EditFormSheet modal={modal} width={920}>
      <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
        <Form.Input field="name" label="组件名称" maxLength={100} rules={[{ required: true }]} />
        <Form.Input field="code" label="组件标识" disabled={modal.isEdit} maxLength={50} placeholder="如 person-profile" rules={[{ required: true }, { pattern: /^[a-z][a-z0-9-]*$/, message: '使用小写字母、数字和中划线' }]} />
      </div>
      <Form.TextArea field="description" label="描述" maxLength={1000} />
      <FormStatusRadioGroup />
      <Form.RadioGroup name="cms-definition-owner-scope" field="ownerScope" label="归属" disabled={modal.isEdit}><Form.Radio value="site">当前站点</Form.Radio><Form.Radio value="shared">平台共享</Form.Radio></Form.RadioGroup>
      <Form.Section text="组件字段"><CmsFieldDefinitionsEditor field="fields" siteId={siteId} /></Form.Section>
    </EditFormSheet>
    <CmsComponentPublishSheet component={publishing} siteId={siteId} onClose={() => setPublishing(null)} />
  </>;
}
