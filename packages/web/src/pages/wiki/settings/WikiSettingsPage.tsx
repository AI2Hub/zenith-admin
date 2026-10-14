import { Banner, Button, InputNumber, Select, Spin, Switch, Toast, Typography } from '@douyinfe/semi-ui';
import type { WikiSpaceVisibility } from '@zenith/shared/wiki';
import { WIKI_SPACE_VISIBILITY_OPTIONS } from '@zenith/shared/wiki';
import { usePermission } from '@/hooks/usePermission';
import { useAvailableKnowledgeBases } from '@/hooks/queries/ai-extras';
import { useUpdateWikiSettings, useWikiSettings } from '@/hooks/queries/wiki-stats';
import { SettingDivider, SettingRow } from '@/components/settings/SettingRow';
import { SettingsEditorTools } from '@/components/settings/SettingsEditorTools';
import { useSettingsEditor } from '@/hooks/useSettingsEditor';

const { Text, Title } = Typography;

/** 页面级全局配置表单（无弹窗、保存后不关闭），不走 useEditModal；设置由运行时设置 wiki 模块承载 */
export default function WikiSettingsPage() {
  const { hasPermission } = usePermission();

  const settingsQuery = useWikiSettings();
  const updateMutation = useUpdateWikiSettings();
  const canEdit = hasPermission('wiki:setting:edit');
  const editor = useSettingsEditor('wiki', settingsQuery.data);
  const { requireApproval, defaultVisibility, aiSyncEnabled, aiSyncKbId, commentsEnabled, recycleRetentionDays, pendingRemindHours } = editor.value;

  const kbQuery = useAvailableKnowledgeBases(aiSyncEnabled);

  async function handleSave() {
    if (aiSyncEnabled && !aiSyncKbId) {
      Toast.warning('开启 AI 同步时必须选择目标知识库');
      return;
    }
    if (await editor.save((body) => updateMutation.mutateAsync({ body }))) Toast.success('设置已保存');
  }

  return (
    <div className="page-container">
      <Spin spinning={settingsQuery.isPending}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ marginBottom: 8 }}>
            <Title heading={5} style={{ margin: 0 }}>知识库设置</Title>
            <Text type="tertiary">发布、协作、内容治理与知识同步策略</Text>
          </div>
          <SettingsEditorTools module="wiki" editor={editor} canWrite={hasPermission('wiki:setting:edit')} saving={updateMutation.isPending} onReload={settingsQuery.refetch} />

          <SettingRow
            title="发布需审核"
            description="开启后文档提交发布需经审核人通过；关闭则提交即发布"
            control={(
              <Switch checked={requireApproval} disabled={!canEdit || updateMutation.isPending} onChange={(next) => editor.setField('requireApproval', next)} />
            )}
          />
          <SettingDivider />
          <SettingRow
            title="空间默认可见性"
            description="新建知识空间时的默认可见范围"
            control={(
              <Select
                style={{ width: 160 }}
                value={defaultVisibility}
                disabled={!canEdit || updateMutation.isPending}
                onChange={(v) => editor.setField('defaultVisibility', v as WikiSpaceVisibility)}
                optionList={WIKI_SPACE_VISIBILITY_OPTIONS}
              />
            )}
          />
          <SettingDivider />
          <SettingRow
            title="同步 AI 知识库"
            description="开启后，已开启同步的空间中发布的文档会自动进入所选 AI 知识库，可在智能对话中引用"
            control={(
              <Switch checked={aiSyncEnabled} disabled={!canEdit || updateMutation.isPending} onChange={(next) => editor.setField('aiSyncEnabled', next)} />
            )}
          />
          {aiSyncEnabled ? (
            <>
              <SettingDivider />
              <SettingRow
                title="同步目标知识库"
                description="文档发布后写入的 AI 知识库"
                control={(
                  <Select
                    style={{ width: 220 }}
                    placeholder="选择 AI 知识库"
                    value={aiSyncKbId ?? undefined}
                    disabled={!canEdit || updateMutation.isPending}
                    loading={kbQuery.isFetching}
                    onChange={(v) => editor.setField('aiSyncKbId', v === undefined ? null : Number(v))}
                    optionList={(kbQuery.data ?? []).map((kb) => ({ value: kb.id, label: kb.name }))}
                    showClear
                  />
                )}
              />
            </>
          ) : null}
          {aiSyncEnabled && (kbQuery.data?.length ?? 0) === 0 && !kbQuery.isFetching ? (
            <Banner
              type="info"
              description="还没有可用的 AI 知识库，请先到 智能助手 → 知识库 创建一个"
            />
          ) : null}
          <SettingDivider />
          <SettingRow
            title="允许评论"
            description="关闭后所有文档暂停新评论，已有评论保留展示"
            control={(
              <Switch checked={commentsEnabled} disabled={!canEdit || updateMutation.isPending} onChange={(next) => editor.setField('commentsEnabled', next)} />
            )}
          />
          <SettingDivider />
          <SettingRow
            title="回收站保留天数"
            description="超期的已删除文档由每日治理任务彻底清理；0 表示永久保留"
            control={(
              <InputNumber
                style={{ width: 140 }}
                min={0}
                max={3650}
                disabled={!canEdit || updateMutation.isPending}
                value={recycleRetentionDays}
                onChange={(v) => editor.setField('recycleRetentionDays', Number(v) || 0)}
                suffix="天"
              />
            )}
          />
          <SettingDivider />
          <SettingRow
            title="审核积压提醒时限"
            description="待审核文档超过该时长未处理时进入治理「审核积压」清单"
            control={(
              <InputNumber
                style={{ width: 140 }}
                min={1}
                max={720}
                disabled={!canEdit || updateMutation.isPending}
                value={pendingRemindHours}
                onChange={(v) => editor.setField('pendingRemindHours', Number(v) || 48)}
                suffix="小时"
              />
            )}
          />

          {canEdit ? (
            <div style={{ marginTop: 24 }}>
              <Button theme="solid" disabled={!editor.dirty} loading={updateMutation.isPending} onClick={() => void handleSave()}>保存设置</Button>
            </div>
          ) : null}
        </div>
      </Spin>
    </div>
  );
}
