import { Banner, Descriptions, Empty, Form, Modal, SideSheet, Toast, Typography, useFormApi, useFormState } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { BodyOf } from '@zenith/shared/core';
import { NUMBERING_SCENE_CODES, NUMBERING_SCOPE_LABELS, numberingDefaultContract, type NumberingDefault } from '@zenith/shared/platform';
import ConfigurableTable from '@/components/ConfigurableTable';
import { EditFormModal } from '@/components/EditFormModal';
import { listTableProps } from '@/components/list-page';
import { useEditModal } from '@/hooks/useEditModal';
import { usePermission } from '@/hooks/usePermission';
import { useNumberingDefaults, useNumberingRuleOptions, useNumberingVersions, useResetNumberingDefault, useUpdateNumberingDefault } from '@/hooks/queries/numbering';
import { createOperationColumn } from '@/components/ResponsiveTableActions';

type DefaultRecord = NumberingDefault & { id: number };
type DefaultValues = BodyOf<typeof numberingDefaultContract.update> & { scene: NumberingDefault['scene'] };
const recordId = (scene: NumberingDefault['scene']) => NUMBERING_SCENE_CODES.indexOf(scene) + 1;

/** The scene is fixed by the selected row; only an already published rule/version may be selected. */
export function NumberingDefaultFields({ record }: Readonly<{ record: NumberingDefault | null }>) {
  const api = useFormApi();
  const { values = {} } = useFormState<Partial<DefaultValues>>();
  const rules = useNumberingRuleOptions(record?.scene, !!record);
  const versions = useNumberingVersions(values.ruleId, !!record);
  const selected = versions.data?.find(version => version.id === values.versionId);
  return (
    <>
      <Descriptions data={[{ key: '业务类型', value: record?.businessName }, { key: '当前来源', value: record ? sourceName(record) : '—' }]} />
      <Typography.Paragraph type="tertiary" size="small">新业务使用这里选定的规则版本。已有编号保持不变；流程在重新发布时固定编号设置。</Typography.Paragraph>
      <Form.Select field="ruleId" label="编号规则" aria-label="默认编号规则" rules={[{ required: true, message: '请选择已发布的编号规则' }]}
        loading={rules.isFetching} filter style={{ width: '100%' }} optionList={(rules.data ?? []).map(rule => ({ value: rule.id, label: `${rule.name}（${rule.code}）` }))}
        onChange={ruleId => api.setValue('versionId', rules.data?.find(rule => rule.id === ruleId)?.versionId)} />
      <Form.Select field="versionId" label="使用版本" aria-label="默认规则使用版本" rules={[{ required: true, message: '请选择已发布版本' }]}
        loading={versions.isFetching} disabled={!values.ruleId} style={{ width: '100%' }}
        optionList={(versions.data ?? []).map(version => ({ value: version.id, label: `v${version.version} · ${version.config.template}` }))} />
      {selected && <Descriptions data={[
        { key: '编号模板', value: <code className="numbering-version-config">{selected.config.template}</code> },
        { key: '流水范围', value: NUMBERING_SCOPE_LABELS[selected.config.scope] },
      ]} />}
      {(rules.isError || versions.isError) && <Banner type="danger" description="规则或版本加载失败，请关闭后重试。" closeIcon={null} />}
      <Typography.Paragraph type="tertiary" size="small">规则发布新版本后，默认规则仍使用此处选定的版本。需要升级时在这里重新选择。</Typography.Paragraph>
    </>
  );
}

function sourceName(row: NumberingDefault) {
  if (row.ruleId === null) return '尚未设置';
  if (row.inherited) return `继承${row.sourceTenantId === null ? '平台默认' : row.sourceTenantName ?? '上级设置'}`;
  return row.sourceTenantId === null ? '平台默认' : `当前租户 · ${row.sourceTenantName ?? '租户设置'}`;
}

export function NumberingDefaultsSheet({ visible, onClose }: Readonly<{ visible: boolean; onClose: () => void }>) {
  const defaults = useNumberingDefaults(visible);
  const update = useUpdateNumberingDefault();
  const reset = useResetNumberingDefault();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('system:numbering:bind');
  const modal = useEditModal<DefaultRecord, DefaultValues>({
    entityName: '默认编号规则', labelWidth: 120,
    save: { isPending: update.isPending, mutateAsync: async ({ values: { scene, ...body } }) => {
      const saved = await update.mutateAsync({ params: { scene }, body });
      return { ...saved, id: recordId(saved.scene) };
    } },
    toValues: row => ({ scene: row.scene, ruleId: row.ruleId ?? undefined, versionId: row.versionId ?? undefined, expectedVersionId: row.expectedVersionId }),
    successMessage: () => '默认编号规则已更新',
  });
  const operation = createOperationColumn<NumberingDefault>({ actions: row => [
    { key: 'edit', label: '编辑', hidden: !canManage, disabled: !row.canUpdate, disabledReason: '此业务的默认规则由平台统一管理',
      onClick: () => modal.openEdit({ ...row, id: recordId(row.scene) }) },
    { key: 'reset', label: '恢复平台默认', hidden: !canManage || !row.canReset,
      onClick: () => { Modal.confirm({ title: `将「${row.businessName}」恢复为平台默认规则？`, content: '当前租户的新业务将使用平台默认版本。已生成的编号和已发布流程的编号设置保持不变。', closeOnEsc: true,
        onOk: async () => { await reset.mutateAsync({ params: { scene: row.scene }, body: { expectedVersionId: row.expectedVersionId } }); Toast.success('已恢复平台默认规则'); } }); } },
  ], width: 220 });
  const columns: ColumnProps<NumberingDefault>[] = [
    { title: '业务类型', dataIndex: 'businessName', width: 150 },
    { title: '默认编号规则', dataIndex: 'ruleName', minWidth: 210, render: value => value ?? '尚未设置' },
    { title: '使用版本', dataIndex: 'version', width: 100, render: value => value === null ? '—' : `v${value}` },
    { key: 'source', title: '来源', width: 190, render: (_, row) => sourceName(row) },
    operation,
  ];
  return (
    <>
      <SideSheet visible={visible} onCancel={onClose} closeOnEsc width={960} title="默认规则" keepDOM={false}>
        <Typography.Paragraph type="tertiary">按业务类型设置默认编号规则和使用版本。具体流程的编号设置在流程设计器中修改，随流程发布固定。</Typography.Paragraph>
        {defaults.isError && <Banner type="danger" description="默认规则加载失败，请关闭后重试。" closeIcon={null} />}
        <ConfigurableTable<NumberingDefault> columns={columns} {...listTableProps(defaults, { rowKey: 'scene', empty: <Empty description="暂无业务类型" /> })} />
      </SideSheet>
      <EditFormModal modal={modal} width={660} title={modal.editing ? `设置「${modal.editing.businessName}」的默认规则` : '设置默认规则'}>
        <NumberingDefaultFields record={modal.editing} />
      </EditFormModal>
    </>
  );
}
