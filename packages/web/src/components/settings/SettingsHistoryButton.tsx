import { useMemo, useState, type CSSProperties } from 'react';
import { Banner, Button, Empty, InputNumber, SideSheet, Space, Spin, TabPane, Tabs, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { History } from 'lucide-react';
import { getByPath } from '@zenith/shared/core';
import {
  SETTINGS_MODULES, describeSettingsDefinition, describeSettingsFields, settingsOverriddenPaths,
  type SettingsDoc, type SettingsEnvelope, type SettingsFieldChange, type SettingsModuleKey, type SettingsRevisionDetail,
} from '@zenith/shared/settings';
import { ListPagination } from '@/components/ListPagination';
import { ModalFooter } from '@/components/ModalFooter';
import { usePagination } from '@/hooks/usePagination';
import {
  useRestoreSettings, useSettings, useSettingsComparison, useSettingsRestorePreview, useSettingsVersion, useSettingsVersions,
} from '@/hooks/queries/settings';
import DateTimeText from '@/components/DateTimeText';

interface SettingsHistoryButtonProps {
  readonly module: SettingsModuleKey;
  readonly dirty?: boolean;
  readonly canRestore?: boolean;
  readonly onRestored?: (saved: SettingsEnvelope<SettingsModuleKey>) => void;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '未设置';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return value || '空字符串';
  return JSON.stringify(value, null, 2);
}

function Value({ value }: Readonly<{ value: unknown }>) {
  return <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0', fontFamily: 'inherit', fontSize: 13 }}>{displayValue(value)}</pre>;
}

function Changes({ changes }: Readonly<{ changes: SettingsFieldChange[] }>) {
  if (changes.length === 0) return <Empty description="值和继承关系均无变化" />;
  return <div>{changes.map((change) => (
    <div key={change.path} style={{ borderBottom: '1px solid var(--semi-color-border)', padding: '12px 0' }}>
      <Space wrap><Typography.Text strong>{change.title}</Typography.Text>
        {change.inheritanceChanged ? <Tag color="orange">继承关系变化</Tag> : null}
      </Space>
      <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
        <div><Typography.Text type="tertiary">变更前 · {change.beforeOverridden ? '本层覆盖' : '继承'}</Typography.Text><Value value={change.before} /></div>
        <div><Typography.Text type="tertiary">变更后 · {change.afterOverridden ? '本层覆盖' : '继承'}</Typography.Text><Value value={change.after} /></div>
      </div>
      {change.added.length > 0 ? <div><Typography.Text type="success">新增 {change.added.length} 项</Typography.Text><Value value={change.added} /></div> : null}
      {change.removed.length > 0 ? <div><Typography.Text type="danger">移除 {change.removed.length} 项</Typography.Text><Value value={change.removed} /></div> : null}
    </div>
  ))}</div>;
}

function Snapshot({ revision }: Readonly<{ revision: SettingsRevisionDetail }>) {
  const descriptors = useMemo(() => describeSettingsDefinition(revision.definition), [revision.definition]);
  const overridden = new Set(settingsOverriddenPaths(revision.overrides));
  const fields = [...new Set([...descriptors.map((field) => field.path), ...settingsOverriddenPaths(revision.effective)])];
  return <div>{fields.map((path) => (
    <div key={path} style={{ padding: '10px 0', borderBottom: '1px solid var(--semi-color-border)' }}>
      <Space wrap><Typography.Text strong>{descriptors.find((field) => field.path === path)?.title ?? path}</Typography.Text>
        <Tag size="small" color={overridden.has(path) ? 'blue' : 'grey'}>{overridden.has(path) ? '本层覆盖' : '继承'}</Tag>
      </Space>
      <Value value={getByPath(revision.effective, path)} />
    </div>
  ))}</div>;
}

function RestoreValues({ module, historic, restored }: Readonly<{ module: SettingsModuleKey; historic: SettingsRevisionDetail; restored: SettingsDoc }>) {
  const fields = new Map([...describeSettingsFields(module), ...describeSettingsDefinition(historic.definition)].map((field) => [field.path, field]));
  const paths = [...new Set([...fields.keys(), ...settingsOverriddenPaths(historic.effective), ...settingsOverriddenPaths(restored)])];
  return <details style={{ marginTop: 16 }}>
    <summary style={{ cursor: 'pointer' }}>对照历史当时生效值与恢复后实际生效值</summary>
    {paths.map((path) => <div key={path} style={{ padding: '8px 0', borderBottom: '1px solid var(--semi-color-border)' }}>
      <Typography.Text strong>{fields.get(path)?.title ?? path}</Typography.Text>
      <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
        <div><Typography.Text type="tertiary">历史当时生效值</Typography.Text><Value value={getByPath(historic.effective, path)} /></div>
        <div><Typography.Text type="tertiary">恢复后实际生效值</Typography.Text><Value value={getByPath(restored, path)} /></div>
      </div>
    </div>)}
  </details>;
}

function HistoryDrawer({ module, dirty = false, canRestore = false, onRestored, onClose }: SettingsHistoryButtonProps & { readonly onClose: () => void }) {
  const currentQuery = useSettings(module);
  const current = currentQuery.data;
  const [selectedVersion, setSelectedVersion] = useState(current?.version ?? 0);
  const [fromVersion, setFromVersion] = useState(Math.max(0, selectedVersion - 1));
  const [toVersion, setToVersion] = useState(selectedVersion);
  const [tab, setTab] = useState('detail');
  const [note, setNote] = useState('');
  const pagination = usePagination({ pageSize: 10, resetKey: module });
  const versions = useSettingsVersions(module, pagination.page, pagination.pageSize);
  const detail = useSettingsVersion(module, selectedVersion);
  const comparison = useSettingsComparison(module, fromVersion, toVersion, tab === 'compare');
  const previewMutation = useSettingsRestorePreview(module);
  const restoreMutation = useRestoreSettings(module);
  const preview = previewMutation.data?.targetVersion === selectedVersion ? previewMutation.data : undefined;
  const previewIsCurrent = preview?.baseToken === current?.baseToken;
  const pending = restoreMutation.isPending;
  const selectVersion = (version: number) => {
    setSelectedVersion(version);
    setFromVersion(Math.max(0, version - 1));
    setToVersion(version);
    setNote('');
    previewMutation.reset();
  };
  const generatePreview = async () => {
    if (!current || dirty || !canRestore) return;
    try { await previewMutation.mutateAsync({ params: { version: selectedVersion }, body: { baseToken: current.baseToken } }); }
    catch { void currentQuery.refetch(); }
  };
  const restore = async () => {
    if (!preview || !previewIsCurrent || dirty || !canRestore || !note.trim() || preview.issues.length > 0 || preview.changes.length === 0) return;
    try {
      const saved = await restoreMutation.mutateAsync({ params: { version: selectedVersion }, body: { baseToken: preview.baseToken, note: note.trim() } });
      onRestored?.(saved);
      Toast.success(saved.version === preview.currentVersion ? '配置没有变化，未创建新版本' : `已创建版本 ${saved.version}（恢复自版本 ${selectedVersion}）`);
      selectVersion(saved.version);
      setTab('detail');
      pagination.resetPage();
    } catch { void currentQuery.refetch(); }
  };
  return (
    <SideSheet visible title={`${SETTINGS_MODULES[module].title} · 版本历史`} width={960} onCancel={() => { if (!pending) onClose(); }}
      footer={tab === 'restore' ? <ModalFooter onCancel={() => { if (!pending) onClose(); }} onOk={restore} cancelText="关闭" okText="确认恢复并创建新版本" loading={pending}
        disabled={!preview || !previewIsCurrent || !canRestore || dirty || !note.trim() || preview.issues.length > 0 || preview.changes.length === 0} /> : undefined}>
      {dirty ? <Banner type="warning" closeIcon={null} description="当前有未保存的修改。可以浏览和比较历史；请先保存或放弃草稿，再恢复历史版本。" style={{ marginBottom: 16 }} /> : null}
      <Space wrap spacing={12}>
        <Typography.Text>当前版本：{current?.version ?? '加载中'}</Typography.Text>
        <Button size="small" disabled={pending} onClick={() => { void currentQuery.refetch(); void versions.refetch(); void detail.refetch(); if (tab === 'compare') void comparison.refetch(); }}>刷新历史</Button>
        <Button size="small" disabled={pending} onClick={() => selectVersion(0)}>版本 0 · 全部继承</Button>
      </Space>
      <Spin spinning={versions.isLoading}>
        <div style={{ marginTop: 12 }}>
          {versions.isError ? <Banner type="danger" description="版本历史加载失败，请重试。" /> : null}
          {versions.data?.list.length === 0 ? <Empty description="尚未保存配置，当前使用默认继承状态" /> : null}
          {versions.data?.list.map((revision) => <div key={revision.id} style={{ padding: 12, marginBottom: 8, borderRadius: 'var(--semi-border-radius-medium)',
            border: `1px solid ${selectedVersion === revision.version ? 'var(--semi-color-primary)' : 'var(--semi-color-border)'}`, background: 'var(--surface-card)' }}>
            <Space wrap spacing={12}>
              <Button theme="borderless" size="small" disabled={pending} onClick={() => selectVersion(revision.version)}>版本 {revision.version}</Button>
              {revision.version === current?.version ? <Tag color="blue">当前</Tag> : null}
              <Typography.Text>{revision.actorName ?? '已删除用户'} · <DateTimeText value={revision.createdAt} /></Typography.Text>
              <Tag>{revision.action === 'restore' ? `恢复自版本 ${revision.restoredFromVersion}` : revision.action === 'initial' ? '初始版本' : '保存'}</Tag>
              <Typography.Text type="tertiary">{revision.changedPaths.length} 项变更</Typography.Text>
            </Space>
            {revision.note ? <Typography.Paragraph style={{ margin: '6px 0 0', overflowWrap: 'anywhere' }}>{revision.note}</Typography.Paragraph> : null}
          </div>)}
        </div>
      </Spin>
      <ListPagination pagination={pagination.buildPagination(versions.data?.total ?? 0)} />
      <Typography.Title heading={5} style={{ marginTop: 24 }}>版本 {selectedVersion}{selectedVersion === 0 ? ' · 当前上级的默认继承状态' : ''}</Typography.Title>
      <Tabs collapsible="auto" activeKey={tab} onChange={setTab}>
        <TabPane tab="版本详情" itemKey="detail">
          <Spin spinning={detail.isLoading}>
            {detail.isError ? <Banner type="danger" description="版本详情加载失败，请重试。" /> : null}
            {detail.data ? <><Typography.Paragraph type="tertiary">{selectedVersion === 0 ? '继承当前上级配置，尚未创建保存记录。' : `保存时继承版本 ${detail.data.inheritedVersion}；以下为当时的完整生效配置。`}</Typography.Paragraph><Snapshot revision={detail.data} /></> : null}
          </Spin>
        </TabPane>
        <TabPane tab="版本比较" itemKey="compare">
          <Space wrap spacing={12} style={{ margin: '12px 0' }}>
            <label>起点版本 <InputNumber aria-label="比较起点版本" min={0} max={current?.version} precision={0} value={fromVersion} onChange={(value) => { if (typeof value === 'number') setFromVersion(value); }} /></label>
            <label>终点版本 <InputNumber aria-label="比较终点版本" min={0} max={current?.version} precision={0} value={toVersion} onChange={(value) => { if (typeof value === 'number') setToVersion(value); }} /></label>
          </Space>
          <Spin spinning={comparison.isLoading}>{comparison.data ? <Changes changes={comparison.data.changes} /> : null}</Spin>
          {comparison.isError ? <Banner type="danger" description="版本比较失败，请检查版本号后重试。" /> : null}
        </TabPane>
        <TabPane tab="恢复版本" itemKey="restore">
          <Banner type="info" closeIcon={null} description="恢复本版本的覆盖与继承关系；继承字段使用当前上级值。确认后生成新版本，已有历史保持不变。" style={{ margin: '12px 0' }} />
          {!canRestore ? <Typography.Paragraph type="tertiary">当前没有恢复权限，或设置正在保存中。</Typography.Paragraph> : null}
          <Button disabled={!canRestore || dirty || !current || pending} loading={previewMutation.isPending} onClick={() => { void generatePreview(); }}>生成恢复预览</Button>
          {preview ? <>
            {!previewIsCurrent ? <Banner type="warning" description="当前配置已经变化，请重新生成恢复预览。" style={{ marginTop: 12 }} /> : null}
            {preview.issues.length > 0 ? <Banner type="danger" title="历史配置不符合当前规则，无法恢复" description={preview.issues.map((issue) => `${issue.path || '设置'}：${issue.message}`).join('；')} style={{ marginTop: 12 }} /> : null}
            <Changes changes={preview.changes} />
            {detail.data ? <RestoreValues module={module} historic={detail.data} restored={preview.restored} /> : null}
            <label style={{ display: 'block', marginTop: 16 }}>恢复说明（必填）
              <TextArea aria-label="恢复说明" value={note} maxCount={500} maxLength={500} disabled={pending || dirty} onChange={setNote} placeholder="说明恢复此版本的原因，最多 500 字" />
            </label>
          </> : null}
        </TabPane>
      </Tabs>
    </SideSheet>
  );
}

export function SettingsHistoryButton(props: SettingsHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="small" icon={<History size={14} />} onClick={() => setOpen(true)}>版本历史</Button>
    {open ? <HistoryDrawer key={props.module} {...props} onClose={() => setOpen(false)} /> : null}
  </>;
}
