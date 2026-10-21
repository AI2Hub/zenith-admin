import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Descriptions, Form, Space, Spin, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { createLabelOptionsFromMap } from '@zenith/shared/core';
import {
  ACCESS_APPROVAL_POLICY_LABELS, ACCESS_REQUEST_TYPE_LABELS, ACCESS_RISK_LABELS, ACCESS_START_MODE_LABELS, ACCESS_VALIDITY_MODE_LABELS,
  accessApprovalPlanSchema, higherAccessRisk, stricterAccessApproval,
  type AccessApprovalPolicy, type AccessRiskLevel, type AccessWorkflowInput, type AccessWorkflowOptions,
} from '@zenith/shared/identity';
import DateTimeText from '@/components/DateTimeText';
import { DATA_SCOPE_OPTIONS } from '@/components/permissions/DataScopePanel';
import type { WorkflowBusinessFormApi, WorkflowBusinessFormProps } from '@/components/workflow/BusinessFormHost';
import { useAccessWorkflowOptions } from '@/hooks/queries/identity-access-governance';
import { formatDateTimeForApi, parseDateTimeParam } from '@/utils/date';
import { singleLineColumns } from '@/utils/table-columns';
import { FormAccessPermissionPicker } from './AccessPermissionPicker';

const { Text } = Typography;
const TYPE_OPTIONS = createLabelOptionsFromMap(ACCESS_REQUEST_TYPE_LABELS);
const START_OPTIONS = createLabelOptionsFromMap(ACCESS_START_MODE_LABELS);
const VALIDITY_OPTIONS = createLabelOptionsFromMap(ACCESS_VALIDITY_MODE_LABELS);
const RISK_COLORS = { low: 'green', high: 'orange', critical: 'red' } as const;
type PickerDate = Date | string | null;
type FormValues = Omit<AccessWorkflowInput, 'startsAt' | 'expiresAt' | 'roleSelections'> & { roleIds: number[]; startsAt?: PickerDate; expiresAt: PickerDate };

function pickerTime(value: PickerDate | undefined): number | undefined {
  return value instanceof Date ? value.getTime() : typeof value === 'string' ? parseDateTimeParam(value)?.getTime() : undefined;
}

function initialValues(value: Record<string, unknown>): FormValues {
  return {
    requestType: value.requestType === 'emergency' ? 'emergency' : 'temporary',
    startMode: value.startMode === 'scheduled' ? 'scheduled' : 'immediate',
    validityMode: value.validityMode === 'permanent' ? 'permanent' : 'limited',
    roleIds: Array.isArray(value.roleSelections) ? (value.roleSelections as AccessWorkflowInput['roleSelections']).map(role => role.roleId) : [],
    permissionCodes: Array.isArray(value.permissionCodes) ? value.permissionCodes as string[] : [],
    startsAt: typeof value.startsAt === 'string' ? parseDateTimeParam(value.startsAt) : null,
    expiresAt: typeof value.expiresAt === 'string' ? parseDateTimeParam(value.expiresAt) : new Date(Date.now() + 480 * 60_000),
    reason: typeof value.reason === 'string' ? value.reason : '',
  };
}

function serialize(values: FormValues, roles: AccessWorkflowOptions['roles']): Record<string, unknown> {
  const { roleIds, ...input } = values;
  return { ...input, roleSelections: roleIds.map(roleId => ({ roleId, version: roles.find(role => role.id === roleId)?.version ?? 0 })), startsAt: values.startMode === 'scheduled' ? formatDateTimeForApi(values.startsAt) : undefined, expiresAt: values.validityMode === 'permanent' ? null : formatDateTimeForApi(values.expiresAt) };
}

function ReadonlyAccessRequest({ value }: Readonly<{ value: Record<string, unknown> }>) {
  const risk = typeof value.riskLevel === 'string' && value.riskLevel in ACCESS_RISK_LABELS ? value.riskLevel as AccessRiskLevel : null;
  const items = Array.isArray(value.permissionItems) ? value.permissionItems as Array<Record<string, unknown>> : [];
  const plan = accessApprovalPlanSchema.safeParse(value.approvalPlan);
  return <div>
    <Descriptions column={2} align="plain" data={[
      { key: '受益人', value: String(value.targetUserName ?? value.targetUserId ?? '当前用户') },
      { key: '申请类型', value: ACCESS_REQUEST_TYPE_LABELS[value.requestType === 'emergency' ? 'emergency' : 'temporary'] },
      { key: '风险等级', value: risk ? <Tag color={RISK_COLORS[risk]}>{ACCESS_RISK_LABELS[risk]}</Tag> : '提交后计算' },
      { key: '生效时间', value: <DateTimeText value={String(value.startsAt ?? '')} mode="absolute" /> },
      { key: '失效时间', value: <DateTimeText value={String(value.expiresAt ?? '')} empty="永久有效" mode="absolute" /> },
      { key: '审批要求', value: plan.success ? `${ACCESS_APPROVAL_POLICY_LABELS[plan.data.approvalPolicy]}${plan.data.mfaRequired ? '；每名审批人均需验证 MFA' : ''}` : '—', span: 2 },
      { key: '申请原因', value: <Text style={{ whiteSpace: 'pre-wrap' }}>{String(value.reason ?? '—')}</Text>, span: 2 },
    ]} />
    {plan.success && plan.data.steps.length > 0 && <div style={{ margin: '16px 0' }}><Text strong>实际审批计划</Text><div style={{ marginTop: 8 }}>{plan.data.steps.map(step => `${step.label}：${step.userName}`).join(' → ')}</div></div>}
    <Table dataSource={items.map((item, index) => ({ ...item, key: index }))} rowKey="key" pagination={false} size="small" empty="暂无权限项" columns={singleLineColumns([
      { title: '权限名称', dataIndex: 'permissionLabel', render: (label: unknown, row: Record<string, unknown>) => String(label ?? row.permissionCode ?? '导航目录') },
      { title: '权限码', dataIndex: 'permissionCode' },
      { title: '来源', render: (_: unknown, row: Record<string, unknown>) => { const snapshot = row.snapshot as Record<string, unknown> | undefined; return snapshot?.roleName ? `角色：${String(snapshot.roleName)}` : '直接申请'; } },
    ])} />
  </div>;
}

export default function AccessRequestWorkflowForm({ mode, value, getFormApi, onValuesChange }: Readonly<WorkflowBusinessFormProps>) {
  const optionsQuery = useAccessWorkflowOptions(mode === 'create');
  const formApi = useRef<FormApi | null>(null);
  const [defaults] = useState(() => initialValues(value));
  const [values, setValues] = useState(defaults);
  const roles = optionsQuery.data?.roles ?? [];
  const menus = optionsQuery.data?.menus ?? [];
  const selectedRoles = roles.filter(role => values.roleIds.includes(role.id));
  const coveredPermissionCodes = useMemo(() => [...new Set((optionsQuery.data?.roles ?? []).filter(role => values.roleIds.includes(role.id)).flatMap(role => role.permissionCodes))], [optionsQuery.data?.roles, values.roleIds]);
  const selectedMenus = menus.filter(menu => !!menu.permission && values.permissionCodes.includes(menu.permission) && menu.requestable);
  const selection = [...selectedRoles, ...selectedMenus];
  const risk = selection.reduce<AccessRiskLevel>((level, item) => higherAccessRisk(level, item.riskLevel), 'low');
  const approval = selection.reduce<AccessApprovalPolicy>((policy, item) => stricterAccessApproval(policy, item.approvalPolicy), 'none');
  const durationLimits = selection.flatMap(item => item.maxDurationMinutes === null ? [] : [item.maxDurationMinutes]);
  const maxMinutes = durationLimits.length ? Math.min(...durationLimits) : null;
  const mfaRequired = selection.some(item => item.mfaRequired);
  const startTimestamp = values.startMode === 'scheduled' ? pickerTime(values.startsAt) : undefined;

  useEffect(() => {
    const api = formApi.current;
    if (!api || maxMinutes === null || values.validityMode === 'permanent') return;
    const expiry = pickerTime(api.getValue('expiresAt') as PickerDate | undefined);
    const limit = (startTimestamp ?? Date.now()) + maxMinutes * 60_000;
    if (expiry !== undefined && expiry > limit) api.setValue('expiresAt', new Date(limit));
  }, [maxMinutes, startTimestamp, values.validityMode]);

  if (mode !== 'create') return <ReadonlyAccessRequest value={value} />;
  if (optionsQuery.isLoading) return <Spin />;
  if (optionsQuery.error) return <Banner type="warning" closeIcon={null} description={optionsQuery.error.message} />;

  const registerApi = (api: FormApi) => {
    formApi.current = api;
    getFormApi?.({
      getValues: () => serialize(api.getValues() as FormValues, roles),
      validate: async () => {
        const current = await api.validate() as FormValues;
        const fail = (message: string): never => { Toast.warning(message); throw new Error(message); };
        if (!(current.roleIds?.length || current.permissionCodes?.length)) fail('请选择至少一项角色或操作权限');
        if (current.roleIds.some(id => !roles.some(role => role.id === id)) || current.permissionCodes.some(code => !menus.some(menu => menu.permission === code && menu.requestable))) fail('所选角色或权限已不可申请，请重新选择');
        const start = (current.startMode === 'scheduled' ? pickerTime(current.startsAt) : Date.now()) ?? Number.NaN;
        const end = pickerTime(current.expiresAt) ?? Number.NaN;
        if (!start || (current.startMode === 'scheduled' && start <= Date.now())) fail('请选择晚于当前时间的预约生效时间');
        if (current.validityMode === 'limited') {
          if (!end || end <= start) fail('失效时间必须晚于生效时间和当前时间');
          if (maxMinutes !== null && end - start > maxMinutes * 60_000) fail(`本次限时申请最长有效 ${maxMinutes} 分钟，请调整失效时间或选择永久有效`);
        }
        return serialize(current, roles);
      },
    } satisfies WorkflowBusinessFormApi);
  };

  return <Form getFormApi={registerApi} initValues={defaults} onValueChange={next => { setValues(next as FormValues); onValuesChange?.(); }} labelPosition="left" labelWidth={110} style={{ width: '100%' }}>
    <Form.RadioGroup field="requestType" name="access-request-type" label="申请类型" options={TYPE_OPTIONS} type="button"
      extraText={values.requestType === 'emergency' ? '用于故障处置等紧急任务，将以紧急授权留痕；仍须按所选权限风险完成全部审批与 MFA 验证。' : '用于日常业务任务，可选择限时或永久有效；审批链由所选权限中最严格的策略决定。'} />
    <Form.Select field="roleIds" label="申请角色包" multiple filter showClear style={{ width: '100%' }}
      optionList={roles.map(role => ({ value: role.id, label: `${role.name} · ${role.permissionCount} 项 · ${ACCESS_RISK_LABELS[role.riskLevel]}` }))} placeholder="可选，按需申请完整角色权限包"
      extraText="角色包按角色配置的数据范围授权。只需要少量权限时，优先在下方逐项选择。" />
    <FormAccessPermissionPicker field="permissionCodes" label="操作权限" menus={menus} coveredPermissionCodes={coveredPermissionCodes} />
    <Form.RadioGroup field="startMode" name="access-start-mode" label="生效方式" options={START_OPTIONS} />
    {values.startMode === 'scheduled' && <Form.DatePicker field="startsAt" label="生效时间" type="dateTime" format="yyyy-MM-dd HH:mm:ss" style={{ width: '100%' }} rules={[{ required: true, message: '请选择预约生效时间' }]} />}
    <Form.RadioGroup field="validityMode" name="access-validity-mode" label="有效期限" options={VALIDITY_OPTIONS} extraText={values.validityMode === 'permanent' ? '无需填写截止时间。授权仍可撤销，并按权限策略定期复核。' : undefined} />
    {values.validityMode !== 'permanent' && <Form.DatePicker field="expiresAt" label="失效时间" type="dateTime" format="yyyy-MM-dd HH:mm:ss" style={{ width: '100%' }} rules={[{ required: true, message: '请选择失效时间' }]}
      extraText={maxMinutes === null ? '可自由选择截止时间，不限制最长时长；如无需截止时间，请选择“永久有效”。实际权限在审批和发放完成后可用。' : `本次限时授权最长 ${maxMinutes} 分钟；如无需截止时间，请选择“永久有效”。实际权限在审批和发放完成后可用。`} />}
    <Form.TextArea field="reason" label="申请原因" maxCount={1000} rows={4} rules={[{ required: true, message: '请填写申请原因' }, { min: 5, message: '申请原因至少 5 个字' }]} placeholder="说明业务任务、必要权限及使用范围，便于审批人判断" />
    {selection.length > 0 && <section aria-label="提交前确认" style={{ margin: '16px 0', padding: 12, backgroundColor: 'var(--semi-color-fill-0)', borderRadius: 'var(--semi-border-radius-small)' }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>提交前确认</Text>
      <Space wrap><Tag color={RISK_COLORS[risk]}>{ACCESS_RISK_LABELS[risk]}</Tag><Text>{ACCESS_APPROVAL_POLICY_LABELS[approval]}</Text><Text>{values.validityMode === 'permanent' ? '永久有效' : '限时有效'}</Text>{mfaRequired && <Tag color="orange">审批需 MFA</Tag>}</Space>
      {selectedRoles.length > 0 && <div style={{ marginTop: 8 }}><Text type="tertiary" size="small">角色数据范围：</Text><Space wrap>{selectedRoles.map(role => <Tag key={role.id}>{role.name}：{DATA_SCOPE_OPTIONS.find(option => option.value === role.dataScope)?.label ?? '—'}</Tag>)}</Space></div>}
      <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 8 }}>实际审批人见右侧审批预览。授权可撤销，并按权限策略定期复核。</Text>
    </section>}
    <Text type="tertiary" size="small">风险、审批人与授权范围以服务端校验结果为准。直接申请的操作权限默认仅作用于本人数据。</Text>
  </Form>;
}
