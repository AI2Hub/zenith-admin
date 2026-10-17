import { useMemo, useRef } from 'react';
import { Banner, Button, Card, Form, Space, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { useAuth } from '@/hooks/useAuth';
import { useAccessCatalog, useCreateAccessRequest, useSubmitAccessRequest } from '@/hooks/queries/identity-access-governance';

const { Title, Text } = Typography;

function localDateTime(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export default function AccessRequestPage() {
  const { user } = useAuth();
  const formApi = useRef<FormApi | null>(null);
  const catalog = useAccessCatalog();
  const create = useCreateAccessRequest();
  const submit = useSubmitAccessRequest();
  const roleOptions = useMemo(() => (catalog.data?.roles ?? []).map((role) => ({ value: role.id, label: `${role.name}（${role.code}）` })), [catalog.data?.roles]);
  const menuOptions = useMemo(() => (catalog.data?.menus ?? []).map((menu) => ({ value: menu.id, label: `${menu.permission ?? menu.title}${menu.permissionLabel ? ` · ${menu.permissionLabel}` : ''}` })), [catalog.data?.menus]);

  if (!user) return null;
  if (catalog.isLoading) return <div className="page-container"><Card loading /></div>;
  if (catalog.error) return <div className="page-container"><Banner type="warning" closeIcon={null} description={catalog.error.message} /></div>;

  const handleSubmit = async () => {
    const values = await formApi.current?.validate() as { roleIds?: number[]; menuIds?: number[]; requestType: 'temporary' | 'emergency'; reason: string; businessReference?: string; startsAt: string; expiresAt: string };
    const items = [
      ...(values.roleIds ?? []).map((roleId) => ({ itemType: 'role' as const, roleId })),
      ...(values.menuIds ?? []).map((menuId) => ({ itemType: 'menu' as const, menuId })),
    ];
    if (items.length === 0) {
      Toast.warning('请选择至少一项角色或菜单权限');
      return;
    }
    const request = await create.mutateAsync({ body: { targetUserId: user.id, requestType: values.requestType, reason: values.reason, businessReference: values.businessReference, startsAt: values.startsAt, expiresAt: values.expiresAt, items } });
    await submit.mutateAsync({ params: { id: request.id } });
    Toast.success('权限申请已提交审批');
    formApi.current?.reset();
  };

  return <div className="page-container"><div style={{ marginBottom: 16 }}><Title heading={5} style={{ margin: 0 }}>权限申请</Title><Text type="tertiary" style={{ display: 'block', marginTop: 8 }}>申请临时权限，审批通过后仅在指定有效期内生效。</Text></div><Card><Space vertical align="start" style={{ width: '100%' }}><div><Text strong>申请人：</Text>{user.nickname || user.username}</div><Form getFormApi={(api) => { formApi.current = api; }} initValues={{ requestType: 'temporary', startsAt: localDateTime(5), expiresAt: localDateTime(8 * 60) }} labelPosition="left" labelWidth={120} style={{ width: '100%' }}><Form.Select field="requestType" label="申请类型" optionList={[{ value: 'temporary', label: '临时授权' }, { value: 'emergency', label: '紧急授权' }]} /><Form.Select field="roleIds" label="申请角色" multiple filter optionList={roleOptions} placeholder="可选：申请一个或多个角色" /><Form.Select field="menuIds" label="申请菜单权限" multiple filter optionList={menuOptions} placeholder="可选：申请具体菜单权限" /><Form.Input field="startsAt" label="生效时间" rules={[{ required: true, message: '请输入生效时间' }]} /><Form.Input field="expiresAt" label="失效时间" rules={[{ required: true, message: '请输入失效时间' }]} /><Form.Input field="businessReference" label="业务关联编号" placeholder="可选，例如故障单或工单号" /><Form.TextArea field="reason" label="申请原因" maxCount={1000} rows={4} rules={[{ required: true, message: '请填写申请原因' }]} /><div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button theme="solid" type="primary" loading={create.isPending || submit.isPending} onClick={() => void handleSubmit()}>提交申请</Button></div></Form><Text type="tertiary" size="small">高危和极高危权限会自动进入更严格的审批链；无法解析审批人的申请会被拒绝，不会自动通过。</Text></Space></Card></div>;
}
