import { useRef } from 'react';
import { Button, Empty, Form, Tabs, Toast } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Save } from 'lucide-react';
import { identitySecurityContract, type LoginRiskEvent } from '@zenith/shared/identity';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { ListSearchToolbar } from '@/components/list-page';
import { EMPTY_PLACEHOLDER, dateTimeColumn, renderEllipsis } from '@/utils/table-columns';
import { usePermission } from '@/hooks/usePermission';
import { useLoginRiskEventList } from '@/hooks/queries/identity-security';
import { useSaveSettings, useSettings } from '@/hooks/queries/settings';
import { SettingsEditorTools } from '@/components/settings/SettingsEditorTools';
import { useSettingsEditor } from '@/hooks/useSettingsEditor';

import { useUrlTabState } from '@/hooks/useUrlTabState';
import { useListPage } from '@/hooks/useListPage';
import { SessionPolicyFields } from './SessionPolicyFields';
import './IdentitySecurityPage.css';
const { TabPane } = Tabs;

export default function IdentitySecurityPage() {
  const { hasPermission } = usePermission();
  const canManagePolicy = hasPermission('system:identity-security:manage');
  const canReadRiskEvents = hasPermission('system:login-risk:list');
  const tabs: Array<'policy' | 'risk'> = [
    ...(canManagePolicy ? ['policy' as const] : []),
    ...(canReadRiskEvents ? ['risk' as const] : []),
  ];
  const [activeTab, setActiveTab] = useUrlTabState(tabs, canManagePolicy ? 'policy' : 'risk');
  // useEditModal 例外：页面级全局配置表单，版本切换/明确恢复继承时重挂载。
  const formApi = useRef<FormApi | null>(null);
  const page = useListPage({
    op: identitySecurityContract.riskEvents,
    useList: useLoginRiskEventList,
    enabled: canReadRiskEvents && activeTab === 'risk',
  });
  const { tableProps } = page;
  // 页面级全局配置表单（无弹窗、保存后不关闭），不走 useEditModal；策略由运行时设置 identitySecurity 模块承载
  const policyQuery = useSettings('identitySecurity', canManagePolicy && activeTab === 'policy');
  const savePolicyMutation = useSaveSettings('identitySecurity');
  const editor = useSettingsEditor('identitySecurity', policyQuery.data);

  async function handleSavePolicy() {
    try {
      await formApi.current?.validate();
    } catch {
      return;
    }
    if (await editor.save((body) => savePolicyMutation.mutateAsync({ body }))) Toast.success('身份安全策略已保存');
  }

  const riskColumns: ColumnProps<LoginRiskEvent>[] = [
    { title: '账号', dataIndex: 'username', width: 140 },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 100,
      render: (value: LoginRiskEvent['riskLevel']) => ({ low: '低', medium: '中', high: '高' }[value]),
    },
    { title: '处置动作', dataIndex: 'action', width: 110, render: (value: LoginRiskEvent['action']) => ({ allow: '放行', challenge: '二次验证', block: '阻断' }[value]) },
    { title: '原因', dataIndex: 'reason', width: 180 },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (value) => value || EMPTY_PLACEHOLDER },
    { title: '位置', dataIndex: 'location', width: 160, render: renderEllipsis },
    dateTimeColumn('时间', 'createdAt'),
  ];

  if (tabs.length === 0) return <Empty description="无访问权限" />;

  return (
    <div className="page-container page-tabs-page">
      <Tabs collapsible="auto" type="line" keepDOM={false} activeKey={activeTab} onChange={(k) => setActiveTab(k as typeof activeTab)}>
        {canManagePolicy && <TabPane tab="策略配置" itemKey="policy">
          <SearchToolbar>
            <Button type="primary" icon={<Save size={14} />} disabled={!editor.dirty} loading={savePolicyMutation.isPending} onClick={handleSavePolicy}>保存</Button>
          </SearchToolbar>
          <div style={{ maxWidth: 760, padding: '4px 0' }}>
            <SettingsEditorTools module="identitySecurity" editor={editor} canWrite={canManagePolicy} saving={savePolicyMutation.isPending} onReload={policyQuery.refetch} />
            <Form
              key={`${editor.base?.baseToken}:${editor.resetKey}`}
              initValues={editor.value}
              onValueChange={(_values, changedValues) => editor.setFields(changedValues)}
              disabled={savePolicyMutation.isPending || !policyQuery.data}
              getFormApi={(api) => { formApi.current = api; }}
              labelPosition="left"
              labelWidth={150}
            >
              <div className="section-title">密码策略</div>
              <Form.InputNumber field="password.minLength" label="最小长度" min={6} max={64} />
              <Form.Switch field="password.requireUppercase" label="必须包含大写" />
              <Form.Switch field="password.requireSpecialChar" label="必须包含特殊字符" />
              <Form.Switch field="password.expiryEnabled" label="启用密码过期" />
              <Form.InputNumber field="password.expiryDays" label="过期天数" min={1} max={3650} />

              {/* 登录失败不再锁定账号：达到阈值只要求验证码，真正的用户凭正确密码 + 验证码仍可登录 */}
              <div className="section-title" style={{ marginTop: 24 }}>登录失败防护</div>
              <Form.InputNumber field="loginChallenge.maxAttemptsPerSource" label="单来源失败阈值" min={1} max={1000} extraText="同一账号 + 同一 IP 的失败次数，达到后该来源需先过验证码" />
              <Form.InputNumber field="loginChallenge.sourceLimit" label="多来源失败阈值" min={1} max={100} extraText="窗口内失败来源 IP 数，达到后该账号所有来源都需验证码（防分布式猜解）" />
              <Form.InputNumber field="loginChallenge.windowMinutes" label="计数窗口（分钟）" min={1} max={1440} />
              <Form.Switch field="loginChallenge.alert.enabled" label="登录失败突增告警" extraText="达到下方阈值即通知安全管理员（身份安全策略管理员 / 登录风险查看者 / 平台超管），同一账号同一原因每个窗口只告警一次" />
              <Form.InputNumber field="loginChallenge.alert.sourceThreshold" label="多来源告警阈值" min={2} max={100} extraText="窗口内失败来源 IP 数达到即告警一次（疑似分布式猜解）" />
              <Form.InputNumber field="loginChallenge.alert.failureThreshold" label="失败总量告警阈值" min={5} max={100000} extraText="窗口内同一账号失败总次数达到即告警一次（疑似口令爆破）" />

              <div className="section-title" style={{ marginTop: 24 }}>会话并发</div>
              <SessionPolicyFields />

              <div className="section-title" style={{ marginTop: 24 }}>MFA 策略</div>
              <Form.Switch field="mfa.enabled" label="启用 MFA" />
              <Form.Select
                field="mfa.mode"
                label="MFA 模式"
                style={{ width: 220 }}
                optionList={[
                  { value: 'off', label: '关闭' },
                  { value: 'optional', label: '用户自愿绑定' },
                  { value: 'required', label: '已绑定用户必需验证' },
                ]}
              />
              <Form.InputNumber field="mfa.rememberDeviceDays" label="可信设备天数" min={1} max={365} />

              <div className="section-title" style={{ marginTop: 24 }}>登录风险</div>
              <Form.Switch field="risk.enabled" label="启用风险策略" />
              <Form.Select
                field="risk.newDeviceAction"
                label="新设备登录"
                style={{ width: 220 }}
                optionList={[
                  { value: 'allow', label: '允许登录' },
                  { value: 'challenge', label: '要求 MFA' },
                ]}
              />

              <div className="section-title" style={{ marginTop: 24 }}>模拟登录</div>
              <Form.Switch field="impersonation.enabled" label="允许模拟登录" extraText="关闭后持有权限的管理员也无法以用户身份登录" />
              <Form.InputNumber field="impersonation.maxMinutes" label="单次时长上限（分钟）" min={1} max={120} extraText="模拟会话到期自动失效，不可续期；上限 120 分钟" />
              <Form.Switch field="impersonation.allowWrite" label="允许可操作模式" extraText="关闭时模拟会话只能只读；开启后发起时可选择可操作（仍禁止改密 / MFA / API Token 等账号安全操作）" />
              <Form.Switch field="impersonation.notifyTarget" label="通知被模拟用户" extraText="开始模拟时向目标用户发送站内通知" />
            </Form>
          </div>
        </TabPane>}

        {canReadRiskEvents && <TabPane tab="风险事件" itemKey="risk">
          <ListSearchToolbar
            page={page}
            filters={['keyword']}
          />
          <ConfigurableTable<LoginRiskEvent>
            columns={riskColumns}
            {...tableProps}
          />
        </TabPane>}
      </Tabs>
    </div>
  );
}
