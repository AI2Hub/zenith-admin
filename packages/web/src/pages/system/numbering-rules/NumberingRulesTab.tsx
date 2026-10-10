import { useRef, useState } from 'react';
import { Banner, Descriptions, Divider, Empty, Modal, SideSheet, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { BodyOf } from '@zenith/shared/core';
import {
  getNumberingScene, NUMBERING_RESET_PERIOD_LABELS, NUMBERING_SCOPE_LABELS,
  numberingRuleContract, previewBusinessNumbers, validateNumberingConfig,
  type NumberingConfig, type NumberingCounter, type NumberingRule, type NumberingVersion,
} from '@zenith/shared/platform';
import ConfigurableTable from '@/components/ConfigurableTable';
import { EditFormSheet } from '@/components/EditFormModal';
import { ListSearchToolbar, listTableProps, useCrudOperationColumn } from '@/components/list-page';
import { CreateButton } from '@/components/toolbar-controls';
import { useEditModal } from '@/hooks/useEditModal';
import { useListPage } from '@/hooks/useListPage';
import { usePermission } from '@/hooks/usePermission';
import {
  useDeleteNumberingRules, useNumberingBindings, useNumberingCounters, useNumberingRuleDetail, useNumberingRuleList,
  useNumberingVersions, usePublishNumberingRule, useSaveNumberingRule,
} from '@/hooks/queries/numbering';
import { abortSubmit } from '@/lib/abort-submit';
import { copyableNoColumn, createdAtColumn, renderEllipsis, renderEnabledStatusTag, updatedAtColumn } from '@/utils/table-columns';
import { DEFAULT_TIMEZONE } from '@/utils/timezones';
import { NumberingRuleEditor } from './NumberingRuleEditor';

type RuleValues = BodyOf<typeof numberingRuleContract.create> & { expectedRevision?: number };
const defaultConfig: NumberingConfig = { template: 'WF-{YYYYMMDD}-{SEQ}', start: '1', step: '1', width: 4, resetPeriod: 'daily', timezone: DEFAULT_TIMEZONE, scope: 'owner' };

function sample(rule: NumberingRule) {
  try {
    const context = Object.fromEntries(getNumberingScene(rule.scene).parameters.map(parameter => [parameter.key, parameter.example]));
    return previewBusinessNumbers(rule.draft, { scene: rule.scene, at: new Date(), context, count: 1 }).numbers[0];
  } catch { return '草稿待完善'; }
}

function RuleDetails({ rule, onClose }: Readonly<{ rule: NumberingRule | null; onClose: () => void }>) {
  const detail = useNumberingRuleDetail(rule?.id, !!rule);
  const versions = useNumberingVersions(rule?.id, !!rule);
  const counters = useNumberingCounters(rule?.id, !!rule);
  const bindings = useNumberingBindings({ ruleId: rule?.id, page: 1, pageSize: 100 }, !!rule);
  const value = detail.data ?? rule;
  const columns: ColumnProps<NumberingVersion>[] = [
    { title: '版本', dataIndex: 'version', width: 80, render: version => `v${version}` },
    { key: 'template', title: '编号模板', dataIndex: 'config', width: 250, render: (config: NumberingConfig) => <code className="numbering-version-config">{config.template}</code> },
    { key: 'scope', title: '流水范围', dataIndex: 'config', width: 100, render: (config: NumberingConfig) => NUMBERING_SCOPE_LABELS[config.scope] },
    { key: 'resetPeriod', title: '重置周期', dataIndex: 'config', width: 100, render: (config: NumberingConfig) => NUMBERING_RESET_PERIOD_LABELS[config.resetPeriod] },
    { key: 'sequence', title: '起始 / 步长 / 位数', dataIndex: 'config', width: 150, render: (config: NumberingConfig) => `${config.start} / ${config.step} / ${config.width}` },
    { key: 'timezone', title: '时区', dataIndex: 'config', width: 160, render: (config: NumberingConfig) => config.timezone },
    createdAtColumn,
  ];
  return (
    <SideSheet visible={!!rule} onCancel={onClose} closeOnEsc title={value?.name ?? '规则详情'} width={960}>
      <Spin spinning={detail.isFetching}>
        {detail.isError && <Banner type="danger" description="规则加载失败，请关闭后重试。" closeIcon={null} />}
        {value && <Descriptions data={[
          { key: '规则编码', value: value.code }, { key: '接入业务', value: getNumberingScene(value.scene).label },
          { key: '当前版本', value: value.currentVersion ? `v${value.currentVersion}` : '未发布' },
          { key: '说明', value: value.description ?? '—' },
        ]} />}
        <Divider align="left">已发布版本</Divider>
        <Typography.Paragraph type="tertiary">发布版本固定保存。发布新版本后，现有业务仍使用各自绑定的版本。</Typography.Paragraph>
        <ConfigurableTable<NumberingVersion> columns={columns} {...listTableProps(versions, { empty: <Empty description="尚未发布版本" /> })} />
        <Divider align="left">流水计数</Divider>
        <Typography.Paragraph type="tertiary">按分配范围与重置周期记录已分配的当前流水值。发布新版本不会重置计数。</Typography.Paragraph>
        {counters.isError && <Banner type="danger" description="流水计数加载失败，请点击表格刷新重试。" closeIcon={null} />}
        <ConfigurableTable<NumberingCounter> columns={[
          { title: '分配范围', dataIndex: 'scopeKey', width: 240, render: renderEllipsis },
          { title: '周期', dataIndex: 'periodKey', width: 150, render: value => value === 'all' ? '不重置' : value },
          copyableNoColumn('当前流水', 'value', { width: 240 }),
        ]} {...listTableProps(counters, { rowKey: record => `${record?.scopeKey}/${record?.periodKey}`, empty: <Empty description="尚未正式取号，暂无流水计数" /> })} />
        <Divider align="left">业务引用</Divider>
        {bindings.isError ? <Banner type="danger" description="业务引用加载失败。" closeIcon={null} /> :
          <ConfigurableTable columns={[
            { title: '业务', dataIndex: 'scene', width: 160, render: scene => getNumberingScene(scene).label },
            { title: '业务对象', dataIndex: 'ownerKey', width: 180, render: value => value === '*' ? '默认规则' : value },
            { title: '固定版本', dataIndex: 'version', width: 100, render: version => `v${version}` }, updatedAtColumn,
          ]} {...listTableProps(bindings, { empty: <Empty description="尚无业务引用" /> })} />}
      </Spin>
    </SideSheet>
  );
}

export function NumberingRulesTab() {
  const { hasPermission } = usePermission();
  const [details, setDetails] = useState<NumberingRule | null>(null);
  const copySource = useRef<NumberingRule | null>(null);
  const page = useListPage({ contract: numberingRuleContract, useList: useNumberingRuleList, table: { empty: <Empty description="还没有编号规则，可以新增一条规则并预览效果。" /> } });
  const save = useSaveNumberingRule();
  const remove = useDeleteNumberingRules();
  const publish = usePublishNumberingRule();
  const modal = useEditModal<NumberingRule, RuleValues>({
    entityName: '编号规则', save, useDetail: useNumberingRuleDetail, labelWidth: 90,
    defaults: () => copySource.current ? {
      name: `${copySource.current.name}（副本）`, code: '', scene: copySource.current.scene, description: copySource.current.description,
      status: 'enabled', draft: structuredClone(copySource.current.draft),
    } : { scene: 'workflow.instance', status: 'enabled', draft: structuredClone(defaultConfig) },
    toValues: rule => ({ code: rule.code, name: rule.name, scene: rule.scene, status: rule.status, description: rule.description, draft: rule.draft, expectedRevision: rule.revision }),
    beforeSave: (values, ctx) => {
      const errors = validateNumberingConfig(values.draft, values.scene);
      if (errors.length) { Toast.warning(errors.join('；')); abortSubmit(); }
      return { ...values, expectedRevision: ctx.editing?.revision };
    },
  });
  const operationColumn = useCrudOperationColumn<NumberingRule>({
    permission: 'system:numbering', edit: modal, remove, label: rule => rule.name,
    disabled: { remove: rule => rule.isBuiltin || rule.currentVersion > 0, reason: rule => rule.isBuiltin ? '内置规则不能删除' : '已发布规则不能删除，可停用规则' },
    content: '已发布、被业务引用或产生编号的规则不能删除。',
    width: 240, desktopInlineKeys: ['details', 'edit', 'publish'],
    extra: rule => [{ key: 'details', label: '详情', onClick: () => setDetails(rule) }],
    extraBetween: rule => [
      { key: 'publish', label: '发布', hidden: !hasPermission('system:numbering:publish'), disabled: rule.status !== 'enabled', disabledReason: '请先启用规则',
        onClick: () => { Modal.confirm({ title: `发布「${rule.name}」的新版本？`, content: '发布后可供业务选择；现有业务绑定版本保持不变，流水不会归零。', closeOnEsc: true,
          onOk: async () => { await publish.mutateAsync({ params: { id: rule.id }, body: { expectedRevision: rule.revision } }); Toast.success('编号规则已发布'); } }); } },
      { key: 'copy', label: '复制', hidden: !hasPermission('system:numbering:create'), onClick: () => { copySource.current = rule; modal.openCreate(); } },
    ],
  });
  const columns: ColumnProps<NumberingRule>[] = [
    { title: '规则名称', dataIndex: 'name', width: 180, render: renderEllipsis },
    copyableNoColumn('规则编码', 'code', { width: 190 }),
    { title: '接入业务', dataIndex: 'scene', width: 140, render: scene => getNumberingScene(scene).label },
    { key: 'example', title: '编号示例', width: 240, render: (_, rule) => renderEllipsis(sample(rule)) },
    { key: 'scope', title: '流水范围', width: 100, render: (_, rule) => NUMBERING_SCOPE_LABELS[rule.draft.scope] },
    { key: 'resetPeriod', title: '重置周期', width: 100, render: (_, rule) => NUMBERING_RESET_PERIOD_LABELS[rule.draft.resetPeriod] },
    { title: '发布版本', dataIndex: 'currentVersion', width: 100, render: version => version ? `v${version}` : <Tag color="grey">未发布</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: renderEnabledStatusTag },
    updatedAtColumn, operationColumn,
  ];
  return (
    <>
      <ListSearchToolbar page={page} filters={['keyword', 'scene', 'status']} create={<CreateButton permission="system:numbering:create" onClick={() => { copySource.current = null; modal.openCreate(); }} />} />
      {page.listQuery.isError && <Banner type="danger" description="编号规则加载失败，请点击查询重试。" closeIcon={null} />}
      <ConfigurableTable<NumberingRule> columns={columns} {...page.tableProps} />
      <EditFormSheet modal={modal} width={1120} okText="保存草稿" header={<Typography.Paragraph type="tertiary">先保存草稿，再发布版本供业务使用。首次发布后，流水范围、重置周期、时区、起始值与步长固定，可复制规则建立新序列。</Typography.Paragraph>}>
        <NumberingRuleEditor editing={modal.isEdit} sequenceLocked={!!modal.editing?.currentVersion} />
      </EditFormSheet>
      <RuleDetails rule={details} onClose={() => setDetails(null)} />
    </>
  );
}
