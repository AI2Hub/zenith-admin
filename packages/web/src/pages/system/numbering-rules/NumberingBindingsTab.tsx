import { Banner, Descriptions, Divider, Empty, Form, Typography, useFormApi, useFormState } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { BodyOf } from '@zenith/shared/core';
import { getNumberingScene, NUMBERING_SCENE_OPTIONS, NUMBERING_SYSTEM_PARAMETERS, numberingBindingContract, parseNumberingTemplate, type NumberingBinding } from '@zenith/shared/platform';
import ConfigurableTable from '@/components/ConfigurableTable';
import { EditFormSheet } from '@/components/EditFormModal';
import { ListSearchToolbar, useCrudOperationColumn } from '@/components/list-page';
import { CreateButton } from '@/components/toolbar-controls';
import { useEditModal } from '@/hooks/useEditModal';
import { useListPage } from '@/hooks/useListPage';
import { useNumberingBindings, useNumberingRuleOptions, useNumberingScenes, useNumberingVersions, useRemoveNumberingBinding, useUpsertNumberingBinding } from '@/hooks/queries/numbering';
import { renderEllipsis, updatedAtColumn } from '@/utils/table-columns';

type BindingValues = BodyOf<typeof numberingBindingContract.upsert>;

function BindingFields({ editing }: Readonly<{ editing: boolean }>) {
  const api = useFormApi();
  const { values = {} } = useFormState<Partial<BindingValues>>();
  const scene = getNumberingScene(values.scene ?? 'workflow.instance');
  const rules = useNumberingRuleOptions(values.scene);
  const versions = useNumberingVersions(values.ruleId);
  const selectedVersion = versions.data?.find(version => version.id === values.versionId);
  const parameterKeys = selectedVersion ? parseNumberingTemplate(selectedVersion.config.template).flatMap(segment => segment.kind === 'parameter' ? [segment.value] : []) : [];
  const customParameters = scene.code === 'workflow.instance' ? [...new Set(parameterKeys)].filter(key => !(NUMBERING_SYSTEM_PARAMETERS as readonly string[]).includes(key)) : [];
  return (
    <>
      <Form.Select field="scene" label="接入业务" optionList={NUMBERING_SCENE_OPTIONS} disabled={editing} style={{ width: '100%' }} onChange={() => {
        api.setValue('ruleId', undefined); api.setValue('versionId', undefined); api.setValue('parameterMapping', {});
      }} />
      <Typography.Paragraph type="tertiary">{scene.description}</Typography.Paragraph>
      <Form.Input field="ownerKey" label="业务对象" disabled={editing} rules={[{ required: true, message: '请填写业务对象标识' }]} extraText="使用 * 设置默认规则；流程实例可填写流程定义 ID。" />
      <Form.Select field="ruleId" label="编号规则" rules={[{ required: true, message: '请选择已发布的编号规则' }]} loading={rules.isFetching} filter style={{ width: '100%' }}
        optionList={(rules.data ?? []).map(rule => ({ value: rule.id, label: `${rule.name}（${rule.code}）` }))}
        onChange={id => { api.setValue('versionId', rules.data?.find(rule => rule.id === id)?.versionId); api.setValue('parameterMapping', {}); }} />
      <Form.Select field="versionId" label="固定版本" rules={[{ required: true, message: '请选择规则版本' }]} loading={versions.isFetching} disabled={!values.ruleId} style={{ width: '100%' }}
        optionList={(versions.data ?? []).map(version => ({ value: version.id, label: `v${version.version} · ${version.config.template}` }))} onChange={() => api.setValue('parameterMapping', {})} />
      {selectedVersion && <Typography.Paragraph type="tertiary">编号模板：{selectedVersion.config.template}</Typography.Paragraph>}
      <Divider align="left">参数映射</Divider>
      {customParameters.length === 0 ? <Typography.Paragraph type="tertiary">此版本无需配置表单参数映射，由业务上下文提供所需参数。</Typography.Paragraph> : (
        <>
          <Typography.Paragraph type="tertiary">流程自定义参数映射到表单字段，填写 formData.字段名。业务分类编码可映射到分类字段。</Typography.Paragraph>
          {customParameters.map(key => <Form.Input key={key} field={`parameterMapping.${key}`} label={scene.parameters.find(parameter => parameter.key === key)?.label ?? key} placeholder="formData.categoryCode" rules={[{ required: true, message: '请选择对应的表单字段路径' }, { pattern: /^formData\.[A-Za-z_][A-Za-z0-9_]*$/, message: '请使用 formData.字段名 格式' }]} />)}
        </>
      )}
      <Typography.Paragraph type="tertiary">租户、部门和发起人身份参数由系统提供，不能映射或覆盖。</Typography.Paragraph>
      {(rules.isError || versions.isError) && <Banner type="danger" description="规则或版本加载失败，请重新打开后重试。" closeIcon={null} />}
    </>
  );
}

export function NumberingBindingsTab() {
  const page = useListPage({ contract: numberingBindingContract, useList: useNumberingBindings, table: { empty: <Empty description="尚未绑定业务。请先发布规则，再设置业务使用的版本。" /> } });
  const scenes = useNumberingScenes();
  const upsert = useUpsertNumberingBinding();
  const remove = useRemoveNumberingBinding();
  const modal = useEditModal<NumberingBinding, BindingValues>({
    entityName: '业务接入', labelWidth: 90,
    save: { isPending: upsert.isPending, mutateAsync: ({ values }) => upsert.mutateAsync({ body: values }) },
    defaults: { scene: 'workflow.instance', ownerKey: '*', parameterMapping: {} },
    toValues: binding => ({ scene: binding.scene, ownerKey: binding.ownerKey, ruleId: binding.ruleId, versionId: binding.versionId, parameterMapping: binding.parameterMapping }),
  });
  const operationColumn = useCrudOperationColumn<NumberingBinding>({
    permissions: { edit: 'system:numbering:bind', remove: 'system:numbering:bind' }, edit: modal,
    remove: row => remove.mutateAsync({ params: { id: row.id } }), label: row => `${getNumberingScene(row.scene).label} / ${row.ownerKey}`,
    disabled: { remove: row => row.tenantId === null && row.ownerKey === '*', reason: '平台默认业务绑定不可删除' },
    content: '移除后此业务对象将使用默认绑定。', width: 150,
  });
  const columns: ColumnProps<NumberingBinding>[] = [
    { title: '接入业务', dataIndex: 'scene', width: 160, render: scene => getNumberingScene(scene).label },
    { title: '业务对象', dataIndex: 'ownerKey', width: 180, render: key => key === '*' ? '默认规则（*）' : renderEllipsis(key) },
    { title: '编号规则', dataIndex: 'ruleName', width: 200, render: renderEllipsis },
    { title: '固定版本', dataIndex: 'version', width: 100, render: version => `v${version}` },
    { title: '参数映射', dataIndex: 'parameterMapping', width: 230, render: (mapping: NumberingBinding['parameterMapping']) => renderEllipsis(Object.entries(mapping).map(([key, value]) => `${key} ← ${value}`).join('；') || '同名属性') },
    updatedAtColumn, operationColumn,
  ];
  const selectedScene = scenes.data?.find(scene => scene.code === page.filterQuery.scene);
  return (
    <>
      <p className="numbering-tab-description">统一配置业务使用的规则版本。工作流发布时会固定编号版本，新版本需随流程重新发布后生效。</p>
      <ListSearchToolbar page={page} filters={['scene', 'ownerKey']} create={<CreateButton permission="system:numbering:bind" onClick={modal.openCreate}>新增接入</CreateButton>} />
      {selectedScene && <Descriptions style={{ marginBottom: 16 }} data={[{ key: '取号时机', value: selectedScene.description }, { key: '长度上限', value: selectedScene.maxLength }]} />}
      {page.listQuery.isError && <Banner type="danger" description="业务接入加载失败，请点击查询重试。" closeIcon={null} />}
      <ConfigurableTable<NumberingBinding> columns={columns} {...page.tableProps} />
      <EditFormSheet modal={modal} width={720}><BindingFields editing={modal.isEdit} /></EditFormSheet>
    </>
  );
}
