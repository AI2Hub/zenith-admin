import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Button, Descriptions, Divider, Form, Space, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import type { BodyOf } from '@zenith/shared/core';
import { CMS_CONTENT_REVIEW_ISSUE_LABELS, cmsContentReviewContract, type CmsContent } from '@zenith/shared/cms';
import { useCmsContentReviewPolicy, useCmsContentReviewRecords, useSaveCmsContentReviewPolicy, useCompleteCmsContentReview, useScanCmsContentReviews } from '@/hooks/queries/cms-content-reviews';
import { useCmsOperationsAssignees } from '@/hooks/queries/cms-operations';
import { usePermission } from '@/hooks/usePermission';
import { useMyAsyncTasks } from '@/hooks/useAsyncTasks';
import { useAsyncTaskAction } from '@/hooks/queries/async-tasks';
import AsyncTaskProgress from '@/components/AsyncTaskProgress';
import PageLoading from '@/components/PageLoading';
import DateTimeText from '@/components/DateTimeText';
import { formatDateTime, formatDateTimeForApi } from '@/utils/date';

type PolicyValues = BodyOf<typeof cmsContentReviewContract.save>;
export default function CmsContentReviewPanel({ content }: Readonly<{ content?: CmsContent }>) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false); const [note, setNote] = useState('');
  const [reviewSubject, setReviewSubject] = useState<{ revisionId: number; version: number } | null>(null);
  const { hasPermission } = usePermission(); const canManage = hasPermission('cms:editorial-task:manage');
  const policyQuery = useCmsContentReviewPolicy(content?.id, !editing); const records = useCmsContentReviewRecords(content?.id);
  const owners = useCmsOperationsAssignees(editing && canManage); const save = useSaveCmsContentReviewPolicy(); const complete = useCompleteCmsContentReview(); const scan = useScanCmsContentReviews();
  const tasks = useMyAsyncTasks({ taskTypes: ['cms-content-review-scan'] }); const cancel = useAsyncTaskAction('cancel');
  const policy = policyQuery.data;
  const task = tasks.tasks.find(item => item.payload?.contentId === content?.id);
  const running = task?.status === 'pending' || task?.status === 'running';
  if (!content) return <Typography.Paragraph style={{ padding: 16 }}>保存稿件后可以配置上线复核周期。</Typography.Paragraph>;
  if (policyQuery.isError) return <Banner type="danger" description={policyQuery.error.message}><Button onClick={() => void policyQuery.refetch()}>重试</Button></Banner>;
  if (!policy) return <PageLoading inline />;
  const reviewChanged = reviewSubject !== null && (reviewSubject.revisionId !== policy.activeRevisionId || reviewSubject.version !== policy.version);
  return <div style={{ padding: 16 }}>
    <Typography.Paragraph type="tertiary">复核面向当前生效的发布修订。巡检发现的问题进入编辑事项，后续按审核发布流程处理。</Typography.Paragraph>
    <Space wrap style={{ marginBottom: 12 }}><Tag color={policy.enabled ? 'green' : 'grey'}>{policy.enabled ? '定期复核已启用' : '未启用定期复核'}</Tag><Tag>{policy.activeRevisionId ? `在线修订 #${policy.activeRevisionId}` : '尚未上线'}</Tag>
      {canManage && !editing ? <Button onClick={() => setEditing(true)}>配置复核策略</Button> : null}
      {canManage && policy.enabled ? <Button loading={scan.isPending} disabled={running} onClick={async () => { await scan.mutateAsync({ body: { siteId: content.siteId, contentId: content.id } }); await tasks.refresh(); Toast.success('已提交后台巡检'); }}>立即巡检</Button> : null}
      <Button theme="borderless" onClick={() => { void policyQuery.refetch(); void records.refetch(); void tasks.refresh(); }}>刷新结果</Button>
    </Space>
    <Descriptions data={[
      { key: '负责人', value: policy.ownerName ?? '未分派' }, { key: '复核周期', value: `${policy.intervalDays} 天` },
      { key: '下次复核', value: policy.nextReviewAt ? formatDateTime(policy.nextReviewAt) : '未安排' }, { key: '资料有效期', value: policy.validUntil ? formatDateTime(policy.validUntil) : '未限制' },
      { key: '上次巡检', value: policy.lastCheckedAt ? formatDateTime(policy.lastCheckedAt) : '尚未巡检' }, { key: '上次人工复核', value: policy.lastReviewedAt ? formatDateTime(policy.lastReviewedAt) : '尚未复核' },
    ]} />
    {editing ? <Form<PolicyValues> initValues={{ ...policy, expectedVersion: policy.version }} onSubmit={async values => {
      await save.mutateAsync({ params: { id: content.id }, body: { ...values, nextReviewAt: values.nextReviewAt ? formatDateTimeForApi(values.nextReviewAt) : null, validUntil: values.validUntil ? formatDateTimeForApi(values.validUntil) : null, ownerId: values.ownerId ?? null } }); setEditing(false); Toast.success('复核策略已保存');
    }} style={{ maxWidth: 760 }}>
      <Form.Switch field="enabled" label="启用定期复核" />
      <Form.Select field="ownerId" label="复核负责人" showClear filter loading={owners.isFetching} optionList={(owners.data ?? []).map(user => ({ value: user.id, label: user.name }))} style={{ width: '100%' }} />
      <Form.InputNumber field="intervalDays" label="复核周期（天）" min={1} max={3650} rules={[{ required: true }]} />
      <Form.DatePicker field="nextReviewAt" label="下次复核时间" type="dateTime" showClear style={{ width: '100%' }} extraText="留空时按复核周期安排。" />
      <Form.DatePicker field="validUntil" label="资料有效期" type="dateTime" showClear style={{ width: '100%' }} extraText="到期会形成处理事项；需要撤下时请走发布中心。" />
      <Form.InputNumber field="noticeDays" label="资料与素材授权到期提前提醒（天）" min={0} max={365} rules={[{ required: true }]} />
      <Form.Switch field="checkLinks" label="检查失效链接" />
      <Form.Switch field="checkAssetRights" label="检查已用素材授权" />
      <Space><Button htmlType="submit" theme="solid" loading={save.isPending}>保存策略</Button><Button onClick={() => setEditing(false)}>取消</Button></Space>
    </Form> : null}
    <Divider margin={16} />
    <Typography.Title heading={6}>巡检结果</Typography.Title>
    {task ? <Space wrap><AsyncTaskProgress task={task} />{running ? <Button loading={cancel.isPending} onClick={async () => { await cancel.mutateAsync({ params: { id: task.id } }); await tasks.refresh(); }}>取消本次巡检</Button> : null}{task.errorMessage ? <Typography.Text type="danger">{task.errorMessage}</Typography.Text> : null}</Space> : null}
    {policy.lastCheckedAt && !policy.issues.length ? <Typography.Paragraph type="tertiary">最近巡检未发现需要处理的问题。</Typography.Paragraph> : null}
    <Space vertical align="start" spacing={8} style={{ width: '100%' }}>{policy.issues.map(issue => <Banner key={issue.key} type="warning" closeIcon={null} description={<><Typography.Text strong>{CMS_CONTENT_REVIEW_ISSUE_LABELS[issue.kind]}</Typography.Text><Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{issue.summary}</Typography.Paragraph>{issue.taskId && canManage ? <Typography.Text link onClick={() => navigate(`/cms/workspace?siteId=${content.siteId}&task=${issue.taskId}`)}>处理编辑事项 #{issue.taskId}</Typography.Text> : null}</>} />)}</Space>
    {canManage && policy.enabled && policy.activeRevisionId ? <>
      <Divider margin={16} /><Typography.Title heading={6}>确认人工复核</Typography.Title>
      <Typography.Paragraph type="tertiary">记录核查结论并安排下个周期，符合条件的复核到期事项同步办结。有效期、素材授权和失效链接问题仍需分别处理。</Typography.Paragraph>
      {reviewSubject ? <Typography.Paragraph type="tertiary">本次核查对象：修订 #{reviewSubject.revisionId}</Typography.Paragraph> : null}
      {reviewChanged ? <Banner type="warning" closeIcon={null} description="填写期间在线修订或复核策略已变化，请重新核查后填写结论。"><Button onClick={() => { setNote(''); setReviewSubject(null); }}>重新开始本次核查</Button></Banner> : null}
      <TextArea aria-label="人工复核说明" value={note} onChange={value => { setNote(value); if (!value.trim()) setReviewSubject(null); else setReviewSubject(previous => previous ?? { revisionId: policy.activeRevisionId!, version: policy.version }); }} maxCount={3000} placeholder="说明核查范围、内容准确性和处理结论" style={{ maxWidth: 760, marginBottom: 8 }} />
      <Button theme="solid" loading={complete.isPending} disabled={!note.trim() || !reviewSubject || reviewChanged || editing} onClick={async () => { await complete.mutateAsync({ params: { id: content.id }, body: { expectedVersion: reviewSubject!.version, revisionId: reviewSubject!.revisionId, note: note.trim() } }); setNote(''); setReviewSubject(null); Toast.success('已记录本次复核并安排下次时间'); }}>确认在线修订已复核</Button>
    </> : null}
    <Divider margin={16} /><Typography.Title heading={6}>复核记录</Typography.Title>
    {records.isError ? <Banner type="danger" description="复核记录读取失败，请刷新重试。" /> : null}
    {(records.data ?? []).map(record => <div key={record.id} style={{ marginBottom: 12 }}><Space wrap><Tag>修订 #{record.revisionId}</Tag><Typography.Text>{record.actorName} · <DateTimeText value={record.createdAt} /></Typography.Text></Space><Typography.Paragraph>{record.note}</Typography.Paragraph><Typography.Text type="tertiary">下次复核：<DateTimeText value={record.nextReviewAt} mode="absolute" /></Typography.Text></div>)}
  </div>;
}
