import { useMemo, useRef } from 'react';
import { Banner, Card, Form, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import type { WorkflowBusinessFormApi, WorkflowBusinessFormProps } from '@/components/workflow/BusinessFormHost';
import { useAccessWorkflowOptions } from '@/hooks/queries/identity-access-governance';
import { useAuth } from '@/hooks/useAuth';

const { Text } = Typography;
const RISK_LABELS = { low: '普通', high: '高危', critical: '极高危' } as const;
const RISK_COLORS = { low: 'green', high: 'orange', critical: 'red' } as const;

function localDateTime(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function ReadonlyAccessRequest({ value }: Readonly<{ value: Record<string, unknown> }>) {
  const risk = typeof value.riskLevel === 'string' && value.riskLevel in RISK_LABELS ? value.riskLevel as keyof typeof RISK_LABELS : null;
  const items = Array.isArray(value.permissionItems) ? value.permissionItems as Array<Record<string, unknown>> : [];
  return <Card title="权限申请内容"><div style={{ display: 'grid', gap: 10 }}><div><Text strong>目标用户：</Text>{String(value.targetUserId ?? '当前用户')}</div><div><Text strong>风险等级：</Text>{risk ? <Tag color={RISK_COLORS[risk]}>{RISK_LABELS[risk]}</Tag> : '提交后由系统计算'}</div><div><Text strong>有效期：</Text>{String(value.startsAt ?? '—')} 至 {String(value.expiresAt ?? '—')}</div><div><Text strong>申请原因：</Text><div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{String(value.reason ?? '—')}</div></div><div><Text strong>权限摘要：</Text><div style={{ marginTop: 4 }}>{String(value.permissionSummary ?? (items.map((item) => String(item.permissionCode ?? item.permissionLabel ?? '')).filter(Boolean).join('、') || '—'))}</div></div></div></Card>;
}

export default function AccessRequestWorkflowForm({ mode, value, getFormApi }: Readonly<WorkflowBusinessFormProps>) {
  const { user } = useAuth();
  const optionsQuery = useAccessWorkflowOptions(mode === 'create');
  const formApi = useRef<FormApi | null>(null);
  const roleOptions = useMemo(() => (optionsQuery.data?.roles ?? []).map((role) => ({ value: role.id, label: `${role.name}（${role.code}）` })), [optionsQuery.data?.roles]);
  const menuOptions = useMemo(() => (optionsQuery.data?.menus ?? []).map((menu) => ({ value: menu.id, label: `${menu.permission ?? menu.title}${menu.permissionLabel ? ` · ${menu.permissionLabel}` : ''}` })), [optionsQuery.data?.menus]);

  if (mode !== 'create') return <ReadonlyAccessRequest value={value} />;
  if (optionsQuery.isLoading) return <Spin />;
  if (optionsQuery.error) return <Banner type="warning" closeIcon={null} description={optionsQuery.error.message} />;

  const registerApi = (api: FormApi) => {
    formApi.current = api;
    getFormApi?.({
      getValues: () => (api.getValues() as Record<string, unknown>) ?? {},
      validate: async () => {
        const values = await api.validate() as Record<string, unknown>;
        const roleIds = Array.isArray(values.roleIds) ? values.roleIds : [];
        const menuIds = Array.isArray(values.menuIds) ? values.menuIds : [];
        if (roleIds.length === 0 && menuIds.length === 0) {
          Toast.warning('请选择至少一项角色或菜单权限');
          throw new Error('请选择至少一项角色或菜单权限');
        }
        return values;
      },
    } satisfies WorkflowBusinessFormApi);
  };

  return <Form getFormApi={registerApi} initValues={{ requestType: 'temporary', startsAt: localDateTime(5), expiresAt: localDateTime(8 * 60), targetUserId: user?.id }} labelPosition="left" labelWidth={110} style={{ width: '100%' }}><Form.Slot label="目标用户"><Text>{user?.nickname || user?.username || '当前用户'}</Text></Form.Slot><Form.Select field="requestType" label="申请类型" optionList={[{ value: 'temporary', label: '临时授权' }, { value: 'emergency', label: '紧急授权' }]} /><Form.Select field="roleIds" label="申请角色" multiple filter optionList={roleOptions} placeholder="可选：申请一个或多个角色" /><Form.Select field="menuIds" label="申请菜单权限" multiple filter optionList={menuOptions} placeholder="可选：申请具体菜单权限" /><Form.Input field="startsAt" label="生效时间" rules={[{ required: true, message: '请输入生效时间' }]} /><Form.Input field="expiresAt" label="失效时间" rules={[{ required: true, message: '请输入失效时间' }]} /><Form.Input field="businessReference" label="业务关联编号" placeholder="可选，例如故障单或工单号" /><Form.TextArea field="reason" label="申请原因" maxCount={1000} rows={4} rules={[{ required: true, message: '请填写申请原因' }]} /><Text type="tertiary" size="small">风险等级和审批人由服务端根据所选权限重新计算，不能由客户端指定。</Text></Form>;
}
