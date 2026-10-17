import { Form, TabPane, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { AccessGrant, AccessRequest, AccessReviewItem, PermissionPolicy, UpdatePermissionPolicyInput } from '@zenith/shared/identity';
import { accessGovernanceContract, ACCESS_RISK_LEVELS } from '@zenith/shared/identity';
import ConfigurableTable from '@/components/ConfigurableTable';
import { EditFormModal } from '@/components/EditFormModal';
import { ListSearchToolbar } from '@/components/list-page';
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

function RiskTag({ value }: { value: AccessRequest['riskLevel'] }) {
  return <Tag color={RISK_COLORS[value]} size="small">{RISK_LABELS[value]}</Tag>;
}

function RequestsTab() {
  const page = useListPage({ op: accessGovernanceContract.requestList, useList: useAccessRequestList, table: { rowKey: 'id', empty: '暂无权限申请' } });
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
  ];
  return <><ListSearchToolbar page={page} filters={['keyword', 'status', 'riskLevel', 'targetUserId', ['startTime', 'endTime']]} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /></>;
}

function GrantsTab() {
  const page = useListPage({ op: accessGovernanceContract.grantList, useList: useAccessGrantList, table: { rowKey: 'id', empty: '暂无临时授权' } });
  const revoke = useRevokeAccessGrant();
  const columns: ColumnProps<AccessGrant>[] = [
    { title: '用户', dataIndex: 'userName', width: 120, render: (value) => value || EMPTY_PLACEHOLDER },
    { title: '风险等级', dataIndex: 'riskLevel', width: 100, render: (value: AccessGrant['riskLevel']) => <RiskTag value={value} /> },
    { title: '状态', dataIndex: 'status', width: 100, render: (value: AccessGrant['status']) => value === 'active' ? <Tag color="green" size="small">{GRANT_STATUS_LABELS[value]}</Tag> : GRANT_STATUS_LABELS[value] },
    { title: '权限项', dataIndex: 'menus', width: 90, render: (menus: AccessGrant['menus']) => `${menus.length} 项` },
    { title: '数据范围', dataIndex: 'dataScope', width: 100, render: (value) => value || '未扩大' },
    dateTimeColumn('生效时间', 'startsAt'),
    dateTimeColumn('失效时间', 'expiresAt'),
    createOperationColumn<AccessGrant>({ width: 110, actions: (row) => [{ key: 'revoke', label: '撤销授权', danger: true, hidden: !['scheduled', 'active'].includes(row.status), loading: revoke.isPending, onClick: () => { confirmDanger({ title: `确认撤销用户「${row.userName ?? row.userId}」的临时授权吗？`, content: '撤销后权限将立即失效。', onOk: async () => { await revoke.mutateAsync({ params: { id: row.id }, body: { reason: '管理员在权限治理中心撤销' } }); Toast.success('临时授权已撤销'); } }); } }] }),
  ];
  return <><ListSearchToolbar page={page} filters={['keyword', 'status', 'riskLevel', 'userId']} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /></>;
}

function ReviewsTab() {
  const page = useListPage({ op: accessGovernanceContract.reviewItemList, useList: useAccessReviewItemList, table: { rowKey: 'id', empty: '暂无待复核权限' } });
  const decide = useDecideAccessReviewItem();
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
    createOperationColumn<AccessReviewItem>({ width: 260, desktopInlineKeys: ['keep', 'revoke'], actions: (row) => [
      { key: 'keep', label: '保留', hidden: row.decision !== 'pending', onClick: () => decideItem(row, 'keep') },
      { key: 'revoke', label: '撤销', danger: true, hidden: row.decision !== 'pending', onClick: () => decideItem(row, 'revoke') },
      { key: 'escalate', label: '升级', hidden: row.decision !== 'pending', onClick: () => decideItem(row, 'escalate') },
    ] }),
  ];
  return <><ListSearchToolbar page={page} filters={['decision', 'riskLevel', 'sourceType', 'userId']} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /></>;
}

function PoliciesTab() {
  const page = useListPage({ op: accessGovernanceContract.policyList, useList: usePermissionPolicyList, table: { rowKey: 'id', empty: '暂无权限策略' } });
  const save = useSavePermissionPolicy();
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
    createOperationColumn<PermissionPolicy>({ width: 100, actions: (row) => [{ key: 'edit', label: '编辑策略', onClick: () => modal.openEdit(row) }] }),
  ];
  return <><div style={{ marginBottom: 12 }}><Text type="tertiary">权限策略由共享权限目录生成，租户管理员可以调整审批方式、最长时长和复核周期。</Text></div><ListSearchToolbar page={page} filters={['keyword', 'riskLevel', 'approvalPolicy']} actions={<RefreshButton onClick={() => void page.listQuery.refetch()} loading={page.listQuery.isFetching} />} /><ConfigurableTable columns={columns} {...page.tableProps} /><EditFormModal modal={modal} width={560}><Form.Input field="permissionCode" label="权限码" disabled /><Form.Select field="riskLevel" label="风险等级" optionList={ACCESS_RISK_LEVELS.map((value) => ({ value, label: RISK_LABELS[value] }))} /><Form.Select field="approvalPolicy" label="审批策略" optionList={Object.entries(APPROVAL_LABELS).map(([value, label]) => ({ value, label }))} /><Form.InputNumber field="maxDurationMinutes" label="最长时长" min={1} max={43200} suffix="分钟" /><Form.InputNumber field="reviewIntervalDays" label="复核周期" min={0} max={3650} suffix="天" /><Form.Switch field="mfaRequired" label="审批时要求 MFA" /><Form.Switch field="enabled" label="启用策略" /></EditFormModal></>;
}

export default function AccessGovernancePage() {
  const { hasPermission } = usePermission();
  const [activeTab, setActiveTab] = useUrlTabState(['requests', 'grants', 'reviews', 'policies'] as const, 'requests');
  const canView = hasPermission('system:access-governance:view');
  if (!canView) return null;
  return <div className="page-container page-tabs-page zx-flat-panels"><div style={{ marginBottom: 16 }}><Title heading={5} style={{ margin: 0 }}>权限治理</Title><Text type="tertiary" style={{ display: 'block', marginTop: 8 }}>管理权限申请、临时授权、权限复核和高危权限策略。</Text></div><Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as typeof activeTab)} type="line" lazyRender keepDOM={false}><TabPane tab="授权申请" itemKey="requests"><RequestsTab /></TabPane><TabPane tab="临时授权" itemKey="grants"><GrantsTab /></TabPane><TabPane tab="权限复核" itemKey="reviews"><ReviewsTab /></TabPane><TabPane tab="策略配置" itemKey="policies" disabled={!hasPermission('system:access-governance:policy')}><PoliciesTab /></TabPane></Tabs></div>;
}
