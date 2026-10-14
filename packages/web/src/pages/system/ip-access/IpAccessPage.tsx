import { useState } from 'react';
import { Button, Card, Switch, TextArea, Toast, Spin, Typography, Tabs, TabPane, Tag } from '@douyinfe/semi-ui';
import { ConfigurableTable } from '@/components/ConfigurableTable';
import { ListSearchToolbar } from '@/components/list-page';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { type IpAccessLog, ipAccessLogContract } from '@zenith/shared/platform';
import { usePermission } from '@/hooks/usePermission';
import { dateTimeColumn, renderEllipsis } from '../../../utils/table-columns';
import { useIpAccessLogs } from '@/hooks/queries/ip-access';
import { useSaveSettings, useSettings } from '@/hooks/queries/settings';
import { isIpOrCidr } from '@zenith/shared/settings';
import { SettingsEditorTools } from '@/components/settings/SettingsEditorTools';
import { useSettingsEditor } from '@/hooks/useSettingsEditor';

import { useUrlTabState } from '@/hooks/useUrlTabState';
import { useListPage } from '@/hooks/useListPage';
const { Title, Text } = Typography;

/** 文本域（每行一条）↔ 名单数组 */
function linesToList(text: string): string[] {
  return [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))];
}

function listToLines(list: readonly string[]): string {
  return list.join('\n');
}
// ─── 拦截日志子页面 ─────────────────────────────────────────────

function IpAccessLogsTab() {
  const page = useListPage({
    contract: ipAccessLogContract,
    useList: useIpAccessLogs,
  });
  const { tableProps } = page;

  const columns: ColumnProps<IpAccessLog>[] = [
    { title: 'IP 地址', dataIndex: 'ip', width: 160 },
    {
      title: '拦截类型', dataIndex: 'blockType', width: 120,
      render: (v: string) => (
        <Tag color={v === 'blacklist' ? 'red' : 'blue'} size="small">
          {v === 'blacklist' ? '黑名单' : '白名单'}
        </Tag>
      ),
    },
    { title: '请求路径', dataIndex: 'path', render: renderEllipsis },
    { title: '请求方法', dataIndex: 'method', width: 100 },
    { title: 'User-Agent', dataIndex: 'userAgent', render: renderEllipsis },
    dateTimeColumn('拦截时间', 'createdAt'),
  ];

  return (
    <>
      <ListSearchToolbar
        page={page}
        filters={['ip', 'blockType']}
        filterTitle="IP 访问筛选"
      />
      <ConfigurableTable<IpAccessLog>
        columns={columns}
        {...tableProps}
      />
    </>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────

export default function IpAccessPage() {
  const [activeTab, setActiveTab] = useUrlTabState(['config', 'logs'] as const, 'config');
  const { hasPermission } = usePermission();
  const canUpdate = hasPermission('system:ip-access:update');
  const canViewLog = hasPermission('system:ip-access:log');

  // 页面级全局配置表单（无弹窗、保存后不关闭），不走 useEditModal；名单由运行时设置 ipAccess 模块承载（平台级）
  const configsQuery = useSettings('ipAccess');
  const saveMutation = useSaveSettings('ipAccess');
  const editor = useSettingsEditor('ipAccess', configsQuery.data);
  const { whitelistEnabled, blacklistEnabled, whitelist, blacklist } = editor.value;
  // 保留文本域的换行/空白交互态；配置草稿依然只保存规范化数组。
  const textKey = `${editor.base?.baseToken}:${editor.resetKey}`;
  const [textDraft, setTextDraft] = useState<{ key: string; whitelist?: string; blacklist?: string }>({ key: '' });
  const whitelistText = textDraft.key === textKey && textDraft.whitelist !== undefined ? textDraft.whitelist : listToLines(whitelist);
  const blacklistText = textDraft.key === textKey && textDraft.blacklist !== undefined ? textDraft.blacklist : listToLines(blacklist);
  const updateList = (key: 'whitelist' | 'blacklist', text: string) => {
    setTextDraft((current) => ({ ...(current.key === textKey ? current : { key: textKey }), [key]: text }));
    editor.setField(key, linesToList(text));
  };

  /** 白名单和黑名单构成一个原子配置版本，统一校验和保存。 */
  const saveSettings = async () => {
    const invalid = [...whitelist, ...blacklist].find((item) => !isIpOrCidr(item));
    if (invalid) {
      Toast.error(`「${invalid}」不是合法的 IP 或 CIDR`);
      return;
    }
    if (await editor.save((body) => saveMutation.mutateAsync({ body }))) Toast.success('保存成功');
  };
  const configContent = configsQuery.isLoading ? (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <Spin size="large" />
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SettingsEditorTools module="ipAccess" editor={editor} canWrite={canUpdate} saving={saveMutation.isPending} onReload={configsQuery.refetch} />
      {/* 白名单 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <Title heading={5} style={{ marginBottom: 4 }}>IP 白名单</Title>
            <Text type="tertiary" style={{ fontSize: 13 }}>
              开启后，仅允许列表中的 IP 或 CIDR 地址段访问系统（公开接口除外）。
            </Text>
          </div>
          <Switch
            checked={whitelistEnabled}
            disabled={!canUpdate || saveMutation.isPending}
            onChange={(next) => editor.setField('whitelistEnabled', next)}
          />
        </div>
        <TextArea
          placeholder={'每行一条，支持单个 IP 或 CIDR，例如：\n192.168.1.1\n10.0.0.0/24'}
          value={whitelistText}
          onChange={(text) => updateList('whitelist', text)}
          disabled={!canUpdate || saveMutation.isPending}
          maxCount={5000}
          rows={6}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Card>

      {/* 黑名单 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <Title heading={5} style={{ marginBottom: 4 }}>IP 黑名单</Title>
            <Text type="tertiary" style={{ fontSize: 13 }}>
              开启后，列表中的 IP 或 CIDR 地址段将被禁止访问系统（黑名单优先于白名单）。
            </Text>
          </div>
          <Switch
            checked={blacklistEnabled}
            disabled={!canUpdate || saveMutation.isPending}
            onChange={(next) => editor.setField('blacklistEnabled', next)}
          />
        </div>
        <TextArea
          placeholder={'每行一条，支持单个 IP 或 CIDR，例如：\n1.2.3.4\n5.6.7.0/24'}
          value={blacklistText}
          onChange={(text) => updateList('blacklist', text)}
          disabled={!canUpdate || saveMutation.isPending}
          maxCount={5000}
          rows={6}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Card>
      {canUpdate ? <div><Button theme="solid" disabled={!editor.dirty} loading={saveMutation.isPending} onClick={() => void saveSettings()}>保存访问控制设置</Button></div> : null}
    </div>
  );

  if (!canViewLog) {
    return configContent;
  }

  return (
    <div className="page-container page-tabs-page">
      <Tabs collapsible="auto" type="line" activeKey={activeTab} onChange={(k) => setActiveTab(k as typeof activeTab)}>
        <TabPane tab="访问控制配置" itemKey="config">
          {configContent}
        </TabPane>
        <TabPane tab="拦截日志" itemKey="logs">
          <IpAccessLogsTab />
        </TabPane>
      </Tabs>
    </div>
  );
}
