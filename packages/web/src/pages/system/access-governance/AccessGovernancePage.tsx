import { useState, type ReactNode } from 'react';
import { Banner, Descriptions, Divider, Form, SideSheet, TabPane, Table, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { AccessGrant, AccessRequest, AccessReviewItem, PermissionPolicy, UpdatePermissionPolicyInput } from '@zenith/shared/identity';
import { accessGovernanceContract, ACCESS_RISK_LEVELS } from '@zenith/shared/identity';
import ConfigurableTable from '@/components/ConfigurableTable';
import DateTimeText from '@/components/DateTimeText';
import { EditFormModal } from '@/components/EditFormModal';
import JsonBlock from '@/components/JsonBlock';
import { ListSearchToolbar } from '@/components/list-page';
import { DATA_SCOPE_OPTIONS } from '@/components/permissions/DataScopePanel';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { RefreshButton } from '@/components/toolbar-controls';
import { useEditModal } from '@/hooks/useEditModal';
import { useListPage } from '@/hooks/useListPage';
import { usePermission } from '@/hooks/usePermission';
import { useUrlTabState } from '@/hooks/useUrlTabState';
import { usePermissionPolicyList, useAccessGrantList, useAccessRequestList, useAccessReviewItemList, useDecideAccessReviewItem, useRevokeAccessGrant, useSavePermissionPolicy } from '@/hooks/queries/identity-access-governance';
import { confirmDanger } from '@/utils/confirm';
import { dateTimeColumn, EMPTY_PLACEHOLDER } from '@/utils/table-columns';

const { Title, Text } = Typography;

const RISK_COLORS: Record<AccessRequest['riskLevel'], 'green' | 'orange' | 'red'> = { low: 'green', high: 'orange', critical: 'red' };
const RISK_LABELS: Record<AccessRequest['riskLevel'], string> = { low: '普通', high: '高危', critical: '极高危' };
const STATUS_LABELS: Record<AccessRequest['status'], string> = { draft: '草稿', pending: '待审批', approved: '已通过', rejected: '已驳回', cancelled: '已取消', applied: '已生效', failed: '执行失败' };
const GRANT_STATUS_LABELS: Record<AccessGrant['status'], string> = { scheduled: '待生效', active: '生效中', expired: '已过期', revoked: '已撤销' };
const REVIEW_DECISION_LABELS: Record<AccessReviewItem['decision'], string> = { pending: '待处理', keep: '保留', revoke: '撤销', extend: '延期', exception: '例外', escalate: '升级处理' };
const APPROVAL_LABELS: Record<UpdatePermissionPolicyInput['approvalPolicy'], string> = { none: '无需审批', manager: '直属主管', manager_security: '主管 + 安全管理员', two_person: '双人审批' };
const REQUEST_TYPE_LABELS: Record<AccessRequest['requestType'], string> = { temporary: '临时授权', emergency: '紧急授权' };
const GRANT_SOURCE_LABELS: Record<AccessGrant['sourceType'], string> = { request: '授权申请', emergency: '紧急授权', admin: '管理员直授' };
const REVIEW_SOURCE_LABELS: Record<AccessReviewItem['sourceType'], string> = { role: '角色', group_role: '用户组角色', direct_menu: '直接菜单权限', temporary_grant: '临时授权' };
const ITEM_TYPE_LABELS: Record<AccessRequest['items'][number]['itemType'], string> = { role: '角色', menu: '菜单' };
const DATA_SCOPE_LABELS: Record<string, string> = Object.fromEntries(DATA_SCOPE_OPTIONS.map((option) => [option.value, option.label]));

function dataScopeLabel(value: string | null | undefined, fallback = EMPTY_PLACEHOLDER): string {
  if (!value) return fallback;
  return DATA_SCOPE_LABELS[value] ?? value;
}

function deptScopeText(ids: number[]): string {
  return ids.length > 0 ? `${ids.length} 个部门` : EMPTY_PLACEHOLDER;
}

function snapshotText(snapshot: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function RiskTag({ value }: { value: AccessRequest['riskLevel'] }) {
  return <Tag color={RISK_COLORS[value]} size="small">{RISK_LABELS[value]}</Tag>;
}

/** 只读详情抽屉壳：查看详情统一走它，避免每个 Tab 重复 SideSheet 样板 */
function DetailSheet({ title, visible, onClose, width, children }: { readonly title: string; readonly visible: boolean; readonly onClose: () => void; readonly width: number; readonly children: ReactNode }) {
  return <SideSheet title={title} visible={visible} onCancel={onClose} width={width} closeOnEsc footer={null}>{children}</SideSheet>;
}

function RequestDetailSheet({ record, onClose }: { readonly record: AccessRequest | null; readonly onClose: () => void }) {
  const itemColumns: ColumnProps<AccessRequest['items'][number]>[] = [
    { title: '类型', dataIndex: 'itemType', width: 80, render: (value: AccessRequest['items'][number]['itemType']) => ITEM_TYPE_LABELS[value] },
    {
      title: '权限',
      dataIndex: 'permissionCode',
      minWidth: 240,
      render: (value: string | null, row) => {
        const label = row.permissionLabel ?? snapshotText(row.snapshot, ['menuTitle', 'roleName']);
        if (value) return label ? `${value} · ${label}` : value;
        return label ?? EMPTY_PLACEHOLDER;
      },
    },
    { title: '数据范围', dataIndex: 'dataScope', width: 150, render: (value: string | null) => dataScopeLabel(value) },
    { title: '部门范围', dataIndex: 'deptScopeIds', width: 100, render: (value: number[]) => deptScopeText(value) },
  ];
  return (
    <DetailSheet title={record ? `权限申请详情 #${record.id}` : '权限申请详情'} visible={record !== null} onClose={onClose} width={760}>
      {record && <>
        {record.status === 'failed' && record.failureReason && <Banner type="danger" closeIcon={null} description={record.failureReason} style={{ marginBottom: 12 }} />}
        <Descriptions
          align="plain"
          layout="horizontal"
          column={2}
          style={{ width: '100%' }}
          data={[
            { key: '申请人', value: record.applicantName ?? EMPTY_PLACEHOLDER },
            { key: '目标用户', value: record.targetUserName ?? EMPTY_PLACEHOLDER },
            { key: '申请类型', value: REQUEST_TYPE_LABELS[record.requestType] },
            { key: '状态', value: STATUS_LABELS[record.status] },
            { key: '风险等级', value: <RiskTag value={record.riskLevel} /> },
            { key: '权限项', value: `${record.items.length} 项` },
            { key: '生效时间', value: <DateTimeText value={record.startsAt} mode="absolute" /> },
            { key: '失效时间', value: <DateTimeText value={record.expiresAt} mode="absolute" /> },
            { key: '业务编号', value: record.businessReference ?? EMPTY_PLACEHOLDER },
            { key: '工作流实例', value: record.workflowInstanceId != null ? `#${record.workflowInstanceId}` : EMPTY_PLACEHOLDER },
            { key: '申请时间', value: <DateTimeText value={record.createdAt} mode="absolute" /> },
            { key: '更新时间', value: <DateTimeText value={record.updatedAt} mode="absolute" /> },
            { key: '通过时间', value: <DateTimeText value={record.approvedAt} mode="absolute" /> },
            { key: '实际生效时间', value: <DateTimeText value={record.appliedAt} mode="absolute" /> },
            { key: '申请原因', value: <Text style={{ whiteSpace: 'pre-wrap' }}>{record.reason}</Text>, span: 2 },
          ]}
        />
        <Divider align="left" style={{ margin: '16px 0 10px' }}>申请权限项（{record.items.length}）</Divider>
        <Table columns={itemColumns} dataSource={record.items} rowKey="id" size="small" pagination={false} empty="暂无权限项" />
      </>}
    </DetailSheet>
  );
}

function GrantDetailSheet({ record, onClose }: { readonly record: AccessGrant | null; readonly onClose: () => void }) {
  const menuColumns: ColumnProps<AccessGrant['menus'][number]>[] = [
    { title: '权限码', dataIndex: 'permissionCode', minWidth: 220, render: (value: string | null) => value ?? EMPTY_PLACEHOLDER },
    { title: '权限名称', dataIndex: 'permissionLabel', width: 200, render: (value: string | null) => value ?? EMPTY_PLACEHOLDER },
    { title: '菜单 ID', dataIndex: 'menuId', width: 90 },
  ];
  return (
    <DetailSheet title={record ? `临时授权详情 #${record.id}` : '临时授权详情'} visible={record !== null} onClose={onClose} width={720}>
      {record && <>
        <Descriptions
          align="plain"
          layout="horizontal"
          column={2}
          style={{ width: '100%' }}
          data={[
            { key: '用户', value: record.userName ?? `用户 #${record.userId}` },
            { key: '来源', value: GRANT_SOURCE_LABELS[record.sourceType] },
            { key: '状态', value: GRANT_STATUS_LABELS[record.status] },
            { key: '风险等级', value: <RiskTag value={record.riskLevel} /> },
            { key: '数据范围', value: dataScopeLabel(record.dataScope, '未扩大') },
            { key: '部门范围', value: deptScopeText(record.deptScopeIds) },
            { key: '生效时间', value: <DateTimeText value={record.startsAt} mode="absolute" /> },
            { key: '失效时间', value: <DateTimeText value={record.expiresAt} mode="absolute" /> },
            { key: '关联申请', value: record.requestId != null ? `#${record.requestId}` : EMPTY_PLACEHOLDER },
            { key: '审批人', value: record.approvedByName ?? EMPTY_PLACEHOLDER },
            { key: '撤销人', value: record.revokedBy != null ? `用户 #${record.revokedBy}` : EMPTY_PLACEHOLDER },
            { key: '撤销时间', value: <DateTimeText value={record.revokedAt} mode="absolute" /> },
            { key: '创建时间', value: <DateTimeText value={record.createdAt} mode="absolute" /> },
            { key: '更新时间', value: <DateTimeText value={record.updatedAt} mode="absolute" /> },
            { key: '撤销原因', value: record.revokeReason ? <Text style={{ whiteSpace: 'pre-wrap' }}>{record.revokeReason}</Text> : EMPTY_PLACEHOLDER, span: 2 },
          ]}
        />
        <Divider align="left" style={{ margin: '16px 0 10px' }}>授权权限项（{record.menus.length}）</Divider>
        <Table columns={menuColumns} dataSource={record.menus} rowKey="menuId" size="small" pagination={false} empty="暂无权限项" />
      </>}
    </DetailSheet>
  );
}

function ReviewDetailSheet({ record, onClose }: { readonly record: AccessReviewItem | null; readonly onClose: () => void }) {
  return (
    <DetailSheet title={record ? `权限复核详情 #${record.id}` : '权限复核详情'} visible={record !== null} onClose={onClose} width={680}>
      {record && <>
        <Descriptions
          align="plain"
          layout="horizontal"
          column={2}
          style={{ width: '100%' }}
          data={[
            { key: '用户', value: record.userName ?? `用户 #${record.userId}` },
            { key: '复核批次', value: `#${record.campaignId}` },
            { key: '来源类型', value: REVIEW_SOURCE_LABELS[record.sourceType] },
            { key: '来源', value: record.sourceLabel ?? EMPTY_PLACEHOLDER },
            { key: '权限', value: record.permissionCode ? `${record.permissionCode}${record.permissionLabel ? ` · ${record.permissionLabel}` : ''}` : (record.sourceLabel ?? EMPTY_PLACEHOLDER), span: 2 },
            { key: '风险等级', value: <RiskTag value={record.riskLevel} /> },
            { key: '复核结果', value: REVIEW_DECISION_LABELS[record.decision] },
            { key: '处理人', value: record.decidedBy != null ? `用户 #${record.decidedBy}` : EMPTY_PLACEHOLDER },
            { key: '处理时间', value: <DateTimeText value={record.decidedAt} mode="absolute" /> },
            { key: '创建时间', value: <DateTimeText value={record.createdAt} mode="absolute" /> },
            { key: '备注', value: record.remark ? <Text style={{ whiteSpace: 'pre-wrap' }}>{record.remark}</Text> : EMPTY_PLACEHOLDER, span: 2 },
          ]}
        />
        {Object.keys(record.snapshot ?? {}).length > 0 && <>
          <Divider align="left" style={{ margin: '16px 0 10px' }}>复核快照</Divider>
          <JsonBlock value={record.snapshot} />
        </>}
      </>}
    </DetailSheet>
  );
}

function PolicyDetailSheet({ record, onClose }: { readonly record: PermissionPolicy | null; readonly onClose: () => void }) {
  return (
    <DetailSheet title={record ? `权限策略详情 · ${record.permissionCode}` : '权限策略详情'} visible={record !== null} onClose={onClose} width={600}>
      {record && <Descriptions
        align="plain"
        layout="horizontal"
        column={2}
        style={{ width: '100%' }}
        data={[
          { key: '权限码', value: record.permissionCode, span: 2 },
          { key: '风险等级', value: <RiskTag value={record.riskLevel} /> },
          { key: '状态', value: record.enabled ? <Tag color="green" size="small">启用</Tag> : <Tag color="grey" size="small">停用</Tag> },
          { key: '审批策略', value: APPROVAL_LABELS[record.approvalPolicy] },
          { key: '审批时要求 MFA', value: record.mfaRequired ? '是' : '否' },
          { key: '最大时长', value: record.maxDurationMinutes ? `${record.maxDurationMinutes} 分钟` : '不限制' },
          { key: '复核周期', value: record.reviewIntervalDays ? `${record.reviewIntervalDays} 天` : '不自动复核' },
          { key: '租户', value: record.tenantId != null ? `#${record.tenantId}` : '平台级' },
          { key: '更新时间', value: <DateTimeText value={record.updatedAt} mode="absolute" /> },
          { key: '创建时间', value: <DateTimeText value={record.createdAt} mode="absolute" /> },
        ]}
      />}
    </DetailSheet>
  );
}

function RequestsTab() {
  const page = useListPage({ op: accessGovernanceContract.requestList, useList: useAccessRequestList, table: { rowKey: 'id', empty: '暂无权限申请' } });
  const [detail, setDetail] = useState<AccessRequest | null>(null);
  const columns: ColumnProps<AccessRequest>[] = [
    { title: '申请人', dataIndex: 'applicantName', width: 120, render: (value) => value || EMPTY_PLACEHOLDER },
    { title: '目标用户', dataIndex: 'targetUserName', width: 120, render: (value) => value || EMPTY_PLACEHOLDER },
    { title: '风险等级', dataIndex: 'riskLevel', width: 100, render: (value: AccessRequest['riskLevel']) => <RiskTag value={value} /> },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: AccessRequest['status']) => STATUS_LABELS[value] },
    { title: '申请原因', dataIndex: 'reason', minWidth: 220, ellipsis: true },
    { title: '权限项', dataIndex: 'items', width: 90, render: (items: AccessRequest['items']) => `${items.length} 项` },
    dateTimeColumn('生效时间', 'startsAt'),
    dateTimeColumn('失效时间', 'expiresAt'),
    dateTimeColumn('申请时间', 'createdAt'),
    createOperationColumn<AccessRequest>({ width: 120, actions: (row) => [{ key: 'detail', label: '查看详情', onClick: () => setDetail(row) }] }),
  ];
  return <><ListSearchToolbar page={page} filters={['keyword', 'status', 'riskLevel', 'targetUserId', ['startTime', 'endTime']]} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /><RequestDetailSheet record={detail} onClose={() => setDetail(null)} /></>;
}

function GrantsTab() {
  const page = useListPage({ op: accessGovernanceContract.grantList, useList: useAccessGrantList, table: { rowKey: 'id', empty: '暂无临时授权' } });
  const revoke = useRevokeAccessGrant();
  const [detail, setDetail] = useState<AccessGrant | null>(null);
  const columns: ColumnProps<AccessGrant>[] = [
    { title: '用户', dataIndex: 'userName', minWidth: 120, render: (value) => value || EMPTY_PLACEHOLDER },
    { title: '风险等级', dataIndex: 'riskLevel', width: 100, render: (value: AccessGrant['riskLevel']) => <RiskTag value={value} /> },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: AccessGrant['status']) => value === 'active' ? <Tag color="green" size="small">{GRANT_STATUS_LABELS[value]}</Tag> : GRANT_STATUS_LABELS[value] },
    { title: '权限项', dataIndex: 'menus', width: 90, render: (menus: AccessGrant['menus']) => `${menus.length} 项` },
    { title: '数据范围', dataIndex: 'dataScope', width: 100, render: (value) => value || '未扩大' },
    dateTimeColumn('生效时间', 'startsAt'),
    dateTimeColumn('失效时间', 'expiresAt'),
    createOperationColumn<AccessGrant>({ width: 210, actions: (row) => [
      { key: 'detail', label: '查看详情', onClick: () => setDetail(row) },
      { key: 'revoke', label: '撤销授权', danger: true, hidden: !['scheduled', 'active'].includes(row.status), loading: revoke.isPending, onClick: () => { confirmDanger({ title: `确认撤销用户「${row.userName ?? row.userId}」的临时授权吗？`, content: '撤销后权限将立即失效。', onOk: async () => { await revoke.mutateAsync({ params: { id: row.id }, body: { reason: '管理员在权限治理中心撤销' } }); Toast.success('临时授权已撤销'); } }); } },
    ] }),
  ];
  return <><ListSearchToolbar page={page} filters={['keyword', 'status', 'riskLevel', 'userId']} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /><GrantDetailSheet record={detail} onClose={() => setDetail(null)} /></>;
}

function ReviewsTab() {
  const page = useListPage({ op: accessGovernanceContract.reviewItemList, useList: useAccessReviewItemList, table: { rowKey: 'id', empty: '暂无待复核权限' } });
  const decide = useDecideAccessReviewItem();
  const [detail, setDetail] = useState<AccessReviewItem | null>(null);
  const decideItem = (row: AccessReviewItem, decision: 'keep' | 'revoke' | 'exception' | 'escalate') => {
    const text = REVIEW_DECISION_LABELS[decision];
    const action = async () => { await decide.mutateAsync({ params: { id: row.id }, body: { decision, remark: `管理员选择：${text}` } }); Toast.success(`已标记为${text}`); };
    if (decision === 'revoke') confirmDanger({ title: '确认撤销这条权限吗？', content: '撤销后将进入授权回收流程。', onOk: action }); else void action();
  };
  const columns: ColumnProps<AccessReviewItem>[] = [
    { title: '用户', dataIndex: 'userName', width: 120, render: (value) => value || EMPTY_PLACEHOLDER },
    { title: '权限', dataIndex: 'permissionCode', minWidth: 220, render: (value, row) => value ? `${value} · ${row.permissionLabel ?? ''}` : row.sourceLabel || EMPTY_PLACEHOLDER },
    { title: '来源', dataIndex: 'sourceType', width: 120 },
    { title: '风险等级', dataIndex: 'riskLevel', width: 100, render: (value: AccessReviewItem['riskLevel']) => <RiskTag value={value} /> },
    { title: '结果', dataIndex: 'decision', width: 100, render: (value: AccessReviewItem['decision']) => REVIEW_DECISION_LABELS[value] },
    dateTimeColumn('创建时间', 'createdAt'),
    createOperationColumn<AccessReviewItem>({ width: 260, desktopInlineKeys: ['detail', 'keep', 'revoke'], actions: (row) => [
      { key: 'detail', label: '查看详情', onClick: () => setDetail(row) },
      { key: 'keep', label: '保留', hidden: row.decision !== 'pending', onClick: () => decideItem(row, 'keep') },
      { key: 'revoke', label: '撤销', danger: true, hidden: row.decision !== 'pending', onClick: () => decideItem(row, 'revoke') },
      { key: 'escalate', label: '升级', hidden: row.decision !== 'pending', onClick: () => decideItem(row, 'escalate') },
    ] }),
  ];
  return <><ListSearchToolbar page={page} filters={['decision', 'riskLevel', 'sourceType', 'userId']} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /><ReviewDetailSheet record={detail} onClose={() => setDetail(null)} /></>;
}

function PoliciesTab() {
  const page = useListPage({ op: accessGovernanceContract.policyList, useList: usePermissionPolicyList, table: { rowKey: 'id', empty: '暂无权限策略' } });
  const save = useSavePermissionPolicy();
  const [detail, setDetail] = useState<PermissionPolicy | null>(null);
  const modal = useEditModal<PermissionPolicy, UpdatePermissionPolicyInput & { permissionCode: string }>({
    entityName: '权限策略',
    save,
    toValues: (record) => ({ permissionCode: record.permissionCode, riskLevel: record.riskLevel, approvalPolicy: record.approvalPolicy, maxDurationMinutes: record.maxDurationMinutes ?? null, reviewIntervalDays: record.reviewIntervalDays, mfaRequired: record.mfaRequired, enabled: record.enabled }),
  });
  const columns: ColumnProps<PermissionPolicy>[] = [
    { title: '权限码', dataIndex: 'permissionCode', minWidth: 260, ellipsis: { showTitle: true } },
    { title: '风险等级', dataIndex: 'riskLevel', width: 100, render: (value: PermissionPolicy['riskLevel']) => <RiskTag value={value} /> },
    { title: '审批策略', dataIndex: 'approvalPolicy', width: 170, ellipsis: { showTitle: true }, render: (value: UpdatePermissionPolicyInput['approvalPolicy']) => APPROVAL_LABELS[value] },
    { title: '最大时长', dataIndex: 'maxDurationMinutes', width: 110, render: (value) => value ? `${value} 分钟` : '不限制' },
    { title: '复核周期', dataIndex: 'reviewIntervalDays', width: 140, ellipsis: { showTitle: true }, render: (value) => value ? `${value} 天` : '不自动复核' },
    { title: '状态', dataIndex: 'enabled', width: 80, render: (value) => value ? <Tag color="green">启用</Tag> : <Tag color="grey">停用</Tag> },
    createOperationColumn<PermissionPolicy>({ width: 210, actions: (row) => [
      { key: 'detail', label: '查看详情', onClick: () => setDetail(row) },
      { key: 'edit', label: '编辑策略', onClick: () => modal.openEdit(row) },
    ] }),
  ];
  return <><div style={{ marginBottom: 12 }}><Text type="tertiary">权限策略由共享权限目录生成，租户管理员可以调整审批方式、最长时长和复核周期。</Text></div><ListSearchToolbar page={page} filters={['keyword', 'riskLevel', 'approvalPolicy']} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /><PolicyDetailSheet record={detail} onClose={() => setDetail(null)} /><EditFormModal modal={modal} width={560}><Form.Input field="permissionCode" label="权限码" disabled /><Form.Select field="riskLevel" label="风险等级" optionList={ACCESS_RISK_LEVELS.map((value) => ({ value, label: RISK_LABELS[value] }))} /><Form.Select field="approvalPolicy" label="审批策略" optionList={Object.entries(APPROVAL_LABELS).map(([value, label]) => ({ value, label }))} /><Form.InputNumber field="maxDurationMinutes" label="最长时长" min={1} max={43200} suffix="分钟" /><Form.InputNumber field="reviewIntervalDays" label="复核周期" min={0} max={3650} suffix="天" /><Form.Switch field="mfaRequired" label="审批时要求 MFA" /><Form.Switch field="enabled" label="启用策略" /></EditFormModal></>;
}

export default function AccessGovernancePage() {
  const { hasPermission } = usePermission();
  const [activeTab, setActiveTab] = useUrlTabState(['requests', 'grants', 'reviews', 'policies'] as const, 'requests');
  const canView = hasPermission('system:access-governance:view');
  if (!canView) return null;
  return <div className="page-container page-tabs-page zx-flat-panels"><div style={{ marginBottom: 16 }}><Title heading={5} style={{ margin: 0 }}>权限治理</Title><Text type="tertiary" style={{ display: 'block', marginTop: 8 }}>管理权限申请、临时授权、权限复核和高危权限策略。</Text></div><Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as typeof activeTab)} type="line" lazyRender keepDOM={false}><TabPane tab="授权申请" itemKey="requests"><RequestsTab /></TabPane><TabPane tab="临时授权" itemKey="grants"><GrantsTab /></TabPane><TabPane tab="权限复核" itemKey="reviews"><ReviewsTab /></TabPane><TabPane tab="策略配置" itemKey="policies" disabled={!hasPermission('system:access-governance:policy')}><PoliciesTab /></TabPane></Tabs></div>;
}
