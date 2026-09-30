import { Banner, Button, Space, Tag } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { useCmsConfigurationDraft, useCmsConfigurationState } from '@/hooks/queries/cms-workbench';
import { CMS_CONFIGURATION_STATE_LABELS, type CmsConfigurationObjectKind } from '@zenith/shared/cms';
import { usePermission } from '@/hooks/usePermission';

export default function CmsConfigurationNotice({ siteId, kind, objectId }: Readonly<{ siteId?: number; kind?: CmsConfigurationObjectKind; objectId?: number }>) {
  const query = useCmsConfigurationState(siteId, kind ?? 'site', objectId, !!kind);
  const draft = useCmsConfigurationDraft(siteId, !kind);
  const navigate = useNavigate();
  const { hasPermission } = usePermission(); const state = query.isError ? undefined : query.data;
  // Multi-object entrances offer navigation without borrowing the site's configuration state.
  if (!kind) {
    if (draft.data) return <Button size="small" style={{ marginBottom: 12 }} onClick={() => navigate(draft.data!.href)}>查看我的配置草稿 #{draft.data.id}</Button>;
    if (!siteId || !hasPermission('cms:publish:view')) return null;
    return <Button size="small" style={{ marginBottom: 12 }} onClick={() => navigate(`/cms/publishing?tab=releases&site=${siteId}`)}>打开发布中心</Button>;
  }
  const saved = !!siteId && (kind === 'site' || !!objectId);
  const messages = { online: '已保存配置与当前生效的线上版本一致。', pending: '已保存配置已进入待发布单，构建并激活后生效。', saved: '已保存配置尚未上线，请准备发布单并激活。' };
  return <Banner type={query.isError ? 'warning' : state?.state === 'online' ? 'success' : 'info'} style={{ marginBottom: 12 }} description={<Space wrap>
    {state ? <Tag color={state.state === 'online' ? 'green' : 'orange'}>{CMS_CONFIGURATION_STATE_LABELS[state.state]}</Tag> : null}
    <span>{!saved ? '保存对象后可查看配置上线状态。' : query.isError ? `配置上线状态读取失败：${query.error.message}` : state ? messages[state.state] : '正在核对已保存配置与线上版本…'}</span>
    {state?.release ? <Button size="small" onClick={() => navigate(state.release!.href)}>{state.release.status === 'failed' ? '查看失败发布单' : state.release.matchesSaved ? '审阅待发布配置' : '查看相关发布单（需更新配置）'} #{state.release.id}</Button>
      : saved && hasPermission('cms:publish:view') && state?.state !== 'online' ? <Button size="small" onClick={() => navigate(`/cms/publishing?tab=releases&site=${siteId}`)}>打开发布中心</Button> : null}
    {query.isError ? <Button size="small" onClick={() => void query.refetch()}>重新读取</Button> : null}
  </Space>} />;
}
