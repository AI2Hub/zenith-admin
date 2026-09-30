import { Banner, Button, Collapsible, Empty, Select, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CMS_RELEASE_CHANGE_LABELS, CMS_RELEASE_CHANGE_OPERATIONS, CMS_RELEASE_CHECK_ACTION_LABELS, cmsReleaseFieldLabel } from '@zenith/shared/cms';
import { ASYNC_TASK_STATUS_LABELS } from '@zenith/shared/tasks';
import { useCmsReleaseReview, useRecreateCmsRelease, useResolveCmsReleaseDependencies } from '@/hooks/queries/cms-workbench';
import { usePermission } from '@/hooks/usePermission';
import { confirmDanger } from '@/utils/confirm';
import CmsValueDiff from './CmsValueDiff';

export default function CmsReleaseReviewPanel({ releaseId, onRecreated, onPreview, canPreview = true }: Readonly<{ releaseId: number; onRecreated: (id: number) => void; onPreview: (path: string) => void; canPreview?: boolean }>) {
  const query = useCmsReleaseReview(releaseId);
  const recreate = useRecreateCmsRelease();
  const resolveDependencies = useResolveCmsReleaseDependencies();
  const { hasPermission } = usePermission();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string>();
  const [dependencySelection, setDependencySelection] = useState<{ fingerprint: string; revisions: Record<number, number> }>({ fingerprint: '', revisions: {} });
  const review = query.data;
  if (query.isError) return <Banner type="danger" description={query.error.message} />;
  if (!review) return <Typography.Text>正在整理变更与交付状态…</Typography.Text>;
  const stale = review.stale;
  const selected = dependencySelection.fingerprint === review.fingerprint ? dependencySelection.revisions : {};
  const revisionIds = Object.values(selected).filter(id => review.dependencyOptions.some(option => option.revisionId === id));
  const canResolve = hasPermission('cms:publish:build') && !stale;
  return <Space vertical align="start" spacing={12} style={{ width: '100%' }}>
    <Typography.Title heading={6}>变更审阅</Typography.Title>
    <Typography.Text type="secondary">相对比较版本 #{review.comparisonGenerationId ?? '首次上线'}，共 {review.changes.length} 项变更。当前线上版本 #{review.currentGenerationId ?? '未上线'}。</Typography.Text>
    {stale && hasPermission('cms:publish:build') ? <Banner type="warning" description={<Space wrap><span>线上版本已变化，请重新准备并审阅发布单。</span><Button size="small" loading={recreate.isPending} onClick={() => confirmDanger({ title: '重新准备发布单？', content: '内容继续采用选定修订；配置读取这些对象当前已保存的工作稿。新发布单需要重新审阅和构建，不会自动上线。', onOk: async () => { const next = await recreate.mutateAsync({ params: { id: releaseId }, body: { expectedGenerationId: review.currentGenerationId, expectedFingerprint: review.fingerprint } }); onRecreated(next.id); } })}>准备新发布单</Button></Space>} /> : null}
    {!review.changes.length ? <Empty description="所选内容与当前线上版本没有字段变化" /> : null}
    {review.changes.map((change, index) => {
      const key = `${change.kind}:${change.id}:${index}`;
      return <div key={key} style={{ width: '100%' }}>
        <Space wrap><Tag>{CMS_RELEASE_CHANGE_LABELS[change.kind]}</Tag><Tag color={change.operation === 'remove' ? 'red' : 'blue'}>{CMS_RELEASE_CHANGE_OPERATIONS[change.operation]}</Tag>
          <Button theme="borderless" onClick={() => setExpanded(expanded === key ? undefined : key)}>{change.title} · {change.fields.length} 个字段</Button>
          <Button size="small" theme="borderless" onClick={() => navigate(change.editPath)}>打开编辑对象</Button>
        </Space>
        <Collapsible isOpen={expanded === key}>{change.fields.map((field) => <div key={field.path} style={{ marginTop: 12 }}><Typography.Text strong>{cmsReleaseFieldLabel(field.path)}</Typography.Text><CmsValueDiff before={field.before} after={field.after} html={field.path === 'body' || field.path === 'page_content'} beforeLabel="比较版本" afterLabel="本次变更" /></div>)}</Collapsible>
      </div>;
    })}
    <Typography.Title heading={6}>检查与影响范围</Typography.Title>
    <Space wrap><Tag color={review.checks.some(check => check.severity === 'error') ? 'red' : 'green'}>{review.checks.filter(check => check.severity === 'error').length} 项阻断</Tag><Tag color="orange">{review.checks.filter(check => check.severity === 'warning').length} 项建议</Tag><Button size="small" loading={query.isFetching} onClick={() => void query.refetch()}>重新检查</Button></Space>
    <Typography.Text type="tertiary">检查时间：{review.validation.checkedAt}。检查针对本发布单固定版本；编辑完成后需重新审核或准备发布单，原发布范围不会随保存变化。</Typography.Text>
    {review.checks.map((check, index) => {
      const options = check.reference?.kind === 'content' ? review.dependencyOptions.filter(option => option.contentId === check.reference!.id) : [];
      return <Banner key={`${check.object.kind}:${check.object.id}:${check.code}:${check.fieldPath}:${check.nodeId}:${index}`} type={check.severity === 'error' ? 'danger' : 'warning'} description={<Space vertical align="start" style={{ width: '100%' }}>
        <Space wrap><Typography.Text strong>{check.object.title}</Typography.Text>{check.object.revisionId ? <Tag>固定修订 #{check.object.revisionId}</Tag> : null}{check.fieldLabel ? <Tag>{check.fieldLabel}</Tag> : null}{check.nodeId ? <Typography.Text type="tertiary">区块 {check.nodeId}</Typography.Text> : null}</Space>
        <Typography.Text>{check.message}</Typography.Text>
        <Space wrap><Typography.Text type="secondary">建议：{CMS_RELEASE_CHECK_ACTION_LABELS[check.recommendedAction]}</Typography.Text>{check.editTarget ? <Button size="small" theme="borderless" onClick={() => navigate(check.editTarget!.href)}>{check.editTarget.label}</Button> : null}</Space>
        {options.length && canResolve ? <Select aria-label={`为${check.object.title}选择已批准依赖`} placeholder="明确选择一份已批准修订" showClear style={{ width: '100%', minWidth: 250 }} value={selected[options[0].contentId]}
          optionList={options.map(option => ({ value: option.revisionId, label: `${option.title} · 修订 ${option.revisionVersion}（#${option.revisionId}）` }))}
          onChange={value => setDependencySelection(current => { const revisions = current.fingerprint === review.fingerprint ? { ...current.revisions } : {}; const contentId = options[0].contentId; if (typeof value === 'number') revisions[contentId] = value; else delete revisions[contentId]; return { fingerprint: review.fingerprint, revisions }; })} /> : null}
        {check.recommendedAction === 'select-approved' && !options.length ? <Typography.Text type="secondary">当前没有可选择的已批准依赖；请由有权限的负责人完成审核，或调整引用后重新准备。</Typography.Text> : null}
      </Space>} />;
    })}
    {review.dependencyOptions.length && canResolve ? <Button disabled={!revisionIds.length} loading={resolveDependencies.isPending} onClick={() => confirmDanger({ title: '补充已选依赖并准备新发布单？', content: '只加入明确选择的已批准修订，保留原固定配置。新发布单需要重新审阅和构建，不会自动上线。', onOk: async () => { const next = await resolveDependencies.mutateAsync({ params: { id: releaseId }, body: { expectedFingerprint: review.fingerprint, expectedGenerationId: review.currentGenerationId, revisionIds } }); setDependencySelection({ fingerprint: '', revisions: {} }); onRecreated(next.id); } })}>补充 {revisionIds.length} 份已选依赖，准备新发布单</Button> : null}
    {review.wholeSiteAffected ? <Typography.Text>包含站点、导航或共享部件变更，将检查整站展示影响。</Typography.Text> : null}
    <Space wrap>{review.affectedPaths.map((path) => <Button key={path} size="small" disabled={!canPreview} onClick={() => onPreview(path)}>{path}</Button>)}</Space>
    <Typography.Title heading={6}>构建与后续交付</Typography.Title>
    {!review.tasks.length ? <Typography.Text type="tertiary">尚未生成交付任务</Typography.Text> : review.tasks.map((task) => <Space key={task.id} wrap>
      <Tag>{ASYNC_TASK_STATUS_LABELS[task.status]}</Tag><Typography.Text>{task.title}</Typography.Text>
      {task.totalCount != null ? <Typography.Text type="tertiary">{task.processedCount}/{task.totalCount}</Typography.Text> : null}
      <Typography.Text type={task.errorMessage ? 'danger' : 'tertiary'}>{task.errorMessage || task.progressNote}</Typography.Text>
    </Space>)}
  </Space>;
}
