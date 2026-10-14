import { useMemo, useState } from 'react';
import { Banner, Button, Input, Modal, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { describeSettingsFields, type SettingsModuleKey } from '@zenith/shared/settings';
import type { useSettingsEditor } from '@/hooks/useSettingsEditor';
import { SettingsHistoryButton } from './SettingsHistoryButton';

interface SettingsEditorToolsProps<M extends SettingsModuleKey> {
  readonly module: M;
  readonly editor: ReturnType<typeof useSettingsEditor<M>>;
  readonly canWrite: boolean;
  readonly saving?: boolean;
  readonly onReload: () => Promise<{ isError: boolean }>;
}

/** 通用页和专用页共用历史、草稿保护、变更说明与显式继承管理。 */
export function SettingsEditorTools<M extends SettingsModuleKey>({ module, editor, canWrite, saving, onReload }: SettingsEditorToolsProps<M>) {
  const [inheritanceOpen, setInheritanceOpen] = useState(false);
  const fields = useMemo(() => describeSettingsFields(module), [module]);
  const reload = async () => {
    const result = await onReload();
    if (!result.isError) editor.discard();
  };
  const discard = () => {
    if (!editor.dirty) { void reload(); return; }
    Modal.confirm({
      title: '放弃当前修改并载入最新版本？',
      content: '当前尚未保存的字段和变更说明将被丢弃。',
      okText: '放弃并重载', cancelText: '继续编辑', onOk: reload,
    });
  };
  return (
    <div style={{ margin: '12px 0' }}>
      <Space wrap>
        {editor.base ? <Tag>版本 {editor.base.version}</Tag> : null}
        <SettingsHistoryButton module={module} dirty={editor.dirty} canRestore={canWrite && !saving} onRestored={editor.discard} />
        {editor.dirty ? <Tag color="orange">有未保存的修改</Tag> : null}
        {canWrite ? <Button size="small" disabled={saving} onClick={discard}>{editor.dirty ? '放弃修改并重载' : '载入最新'}</Button> : null}
        {editor.overriddenPaths.length > 0 ? <Button size="small" disabled={saving} onClick={() => setInheritanceOpen((open) => !open)}>{inheritanceOpen ? '收起继承设置' : `管理继承（${editor.overriddenPaths.length} 项覆盖）`}</Button> : null}
      </Space>
      {editor.stale || editor.conflict ? <Banner type="warning" closeIcon={null} style={{ marginTop: 12 }}
        description="此配置或其上级配置已发生变化。当前草稿已保留，请先通过版本历史查看差异；放弃修改并重载后可基于最新版本重新编辑。" /> : null}
      {inheritanceOpen && editor.overriddenPaths.length > 0 ? (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--semi-color-fill-0)', borderRadius: 'var(--semi-border-radius-medium)' }}>
          <Typography.Text type="tertiary" size="small">已覆盖的字段保持本层值；恢复继承后跟随上级设置，保存后生效。</Typography.Text>
          {editor.overriddenPaths.map((path) => <div key={path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
            <Typography.Text>{fields.find((field) => field.path === path)?.title ?? path}</Typography.Text>
            {canWrite ? <Button size="small" theme="borderless" disabled={saving} onClick={() => editor.revert(path)}>恢复继承</Button> : <Tag size="small">已覆盖</Tag>}
          </div>)}
          {canWrite ? <Button size="small" style={{ marginTop: 12 }} disabled={saving} onClick={editor.revertAll}>全部恢复继承</Button> : null}
        </div>
      ) : null}
      {canWrite && editor.dirty ? <Input aria-label="变更说明" placeholder="变更说明（选填，最多 500 字）" maxLength={500} value={editor.note} disabled={saving}
        onChange={editor.setNote} style={{ marginTop: 12 }} /> : null}
    </div>
  );
}
