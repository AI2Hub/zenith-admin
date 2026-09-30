import { useRef, useState } from 'react';
import { Form } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { EMPTY_PLACEHOLDER, createdAtColumn } from '@/utils/table-columns';
import { usePermission } from '@/hooks/usePermission';
import { useEditModal } from '@/hooks/useEditModal';
import { useCmsTagList, useSaveCmsTag, useDeleteCmsTags, useAllCmsTags } from '@/hooks/queries/cms';
import { cmsTagContract, type CmsTag, type CmsVocabulary, type CreateCmsTagInput } from '@zenith/shared/cms';
import { CmsSiteSelect } from './CmsSiteSelect';
import { CreateButton } from '@/components/toolbar-controls';
import { deleteAction, ListSearchToolbar } from '@/components/list-page';
import { slugifyName } from '@/utils/slug';
import { abortSubmit } from '@/lib/abort-submit';
import { useListPage } from '@/hooks/useListPage';
import { EditFormModal } from '@/components/EditFormModal';
import { KeywordInput } from '@/components/search-filters';

export default function TagsPage({ vocabulary }: Readonly<{ vocabulary?: CmsVocabulary }> = {}) {
  const { hasPermission } = usePermission();
  const [siteId, setSiteId] = useState<number | undefined>(vocabulary?.siteId);
  const page = useListPage({
    contract: cmsTagContract,
    useList: useCmsTagList,
    params: { siteId: siteId ?? 0, vocabularyId: vocabulary?.id },
    enabled: siteId !== undefined,
    table: { empty: '暂无标签' },
  });
  const { setPage, tableProps } = page;

  const allTags = useAllCmsTags(siteId);
  const saveMutation = useSaveCmsTag();
  const modal = useEditModal<CmsTag, Omit<Partial<CreateCmsTagInput>, 'localeLabels'> & { localeLabels?: string }, Partial<CreateCmsTagInput>>({
    entityName: '标签',
    save: saveMutation,
    toValues: (record) => ({ name: record.name, slug: record.slug, groupName: record.groupName ?? '', parentId: record.parentId ?? undefined, aliases: record.aliases ?? [], localeLabels: JSON.stringify(record.localeLabels ?? {}, null, 2) }),
    beforeSave: (values, { isEdit }) => {
      if (!isEdit && !siteId) abortSubmit('validation');
      return {
        ...values, vocabularyId: vocabulary?.id ?? modal.editing?.vocabularyId ?? null,
        aliases: Array.isArray(values.aliases) ? values.aliases : [],
        localeLabels: typeof values.localeLabels === 'string' ? JSON.parse(values.localeLabels || '{}') : values.localeLabels ?? {},
        ...(!isEdit ? { siteId } : {}),
        groupName: typeof values.groupName === 'string' && values.groupName.trim() === '' ? null : values.groupName,
      };
    },
  });
  const deleteMutation = useDeleteCmsTags();

  // 新建时按名称自动生成拼音 slug；用户手改过（当前值 ≠ 上次自动值）则不再覆盖
  const lastAutoSlug = useRef('');
  const handleNameChange = (value: string) => {
    if (modal.isEdit) return;
    const api = modal.formApi.current;
    if (!api) return;
    const current = (api.getValue('slug') as string | undefined) ?? '';
    if (current && current !== lastAutoSlug.current) return;
    const next = slugifyName(value, 100);
    lastAutoSlug.current = next;
    api.setValue('slug', next);
  };

  const columns: ColumnProps<CmsTag>[] = [
    { title: '标签名称', dataIndex: 'name', minWidth: 180 },
    { title: 'URL 标识', dataIndex: 'slug', width: 160 },
    { title: '分组', dataIndex: 'groupName', width: 130, render: (v: string | null) => v || EMPTY_PLACEHOLDER },
    { title: '关联内容数', dataIndex: 'contentCount', width: 120, align: 'right' },
    createdAtColumn,
    createOperationColumn<CmsTag>({
      width: 150,
      desktopInlineKeys: ['edit', 'delete'],
      actions: (record) => [
        ...((hasPermission('cms:tag:update') || !!vocabulary && hasPermission('cms:taxonomy:manage')) ? [{
          key: 'edit',
          label: '编辑',
          onClick: () => modal.openEdit(record),
        }] : []),
        deleteAction({
          hidden: !(hasPermission('cms:tag:delete') || !!vocabulary && hasPermission('cms:taxonomy:manage')),
          title: '确定要删除该标签吗？',
          content: '删除后关联内容的打标关系将一并移除',
          run: () => deleteMutation.mutateAsync([record.id]),
        }),
      ],
    }),
  ];

  return (
    <div className="page-container">
      {/* 站点选择放在首位，分组搜索作为附加筛选 */}
      <ListSearchToolbar
        keyword={(
          <>
            {!vocabulary && <CmsSiteSelect value={siteId} onChange={(v) => { setSiteId(v); setPage(1); }} width={180} />}
            <KeywordInput placeholder="搜索关键字" {...page.bindKeyword('keyword')} />
          </>
        )}
        filters={<KeywordInput placeholder="搜索分组" {...page.bindKeyword('groupName')} width={160} />}
        onSearch={page.toolbarProps.onSearch}
        onReset={page.toolbarProps.onReset}
        create={<CreateButton permission={vocabulary ? 'cms:taxonomy:manage' : 'cms:tag:create'} onClick={modal.openCreate} />}
      />

      <ConfigurableTable<CmsTag>
        columns={columns}
        {...tableProps}
      />

      <EditFormModal modal={modal} width={480}>
        <Form.Input field="name" label="标签名称" onChange={(v) => handleNameChange(String(v ?? ''))} rules={[{ required: true, message: '请输入标签名称' }]} />
        <Form.Input field="slug" label="URL 标识" placeholder="输入名称自动生成，可修改" rules={[{ required: true, message: '请输入 URL 标识' }]} />
        <Form.Input field="groupName" label="分组" placeholder="可选，如「产品」「行业」，便于归类管理" maxLength={50} />
        {vocabulary ? <>
          <Form.Select field="parentId" label="父词条" showClear optionList={(allTags.data ?? []).filter(term => term.vocabularyId === vocabulary.id && term.id !== modal.editing?.id).map(term => ({ value: term.id, label: term.name }))} />
          <Form.TagInput field="aliases" label="别名" />
          <Form.TextArea field="localeLabels" label="多语言名称" placeholder={'{"en-US":"Beijing"}'} rules={[{ validator: (_rule, value) => { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed); } catch { return false; } }, message: '请输入语言代码到名称的 JSON 对象' }]} />
        </> : null}
      </EditFormModal>
    </div>
  );
}
