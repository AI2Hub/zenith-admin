import { useState } from 'react';
import { Banner, Button, Card, Descriptions, InputNumber, Select, SideSheet, Space, Spin, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { CMS_EDITORIAL_TASK_HISTORY_ACTION_LABELS, CMS_EDITORIAL_GOAL_METRIC_LABELS, CMS_EDITORIAL_OBSERVATION_LABELS, CMS_EDITORIAL_TASK_SOURCE_LABELS, CMS_EDITORIAL_TASK_STATUS_LABELS, cmsStatRate, type CmsEditorialGoal, type CmsEditorialMetricSnapshot, type CmsEditorialTask, type CmsEditorialTaskDetail, type CmsEditorialTaskObservation } from '@zenith/shared/cms';
import { useCmsContentDetail } from '@/hooks/queries/cms-contents';
import { useCmsEditorialTaskDetail, useCompleteCmsEditorialTask, useVerifyCmsEditorialTask, useReopenCmsEditorialTask, useRefreshCmsEditorialObservations } from '@/hooks/queries/cms-operations';
import { usePermission } from '@/hooks/usePermission';
import DateTimeText from '@/components/DateTimeText';
import ConfigurableTable from '@/components/ConfigurableTable';

const metricValue = (snapshot: CmsEditorialMetricSnapshot, metric: CmsEditorialGoal['metric']) => metric === 'no_result_rate' ? cmsStatRate(snapshot.metrics.noResultSearches, snapshot.metrics.searches) : metric === 'read_rate' ? snapshot.metrics.readRate : snapshot.metrics.conversionRate;
function Observation({ observation, goal }: Readonly<{ observation: CmsEditorialTaskObservation; goal: CmsEditorialGoal | null }>) {
  const pairs = [{ key: 'searches', label: '搜索次数' }, { key: 'noResultSearches', label: '无结果次数' }, { key: 'searchClicks', label: '搜索点击' }, { key: 'pv', label: '内容浏览 PV' }, { key: 'uv', label: '区间访客 UV' }, { key: 'reads', label: '有效阅读' }, { key: 'conversions', label: '成功转化' }] as const;
  return <Card style={{ width: '100%' }} title={`${observation.windowDays} 天${observation.windowDays === 7 ? '中期观察' : '最终复盘'}`} headerExtraContent={<Tag color={observation.outcome === 'improved' ? 'green' : 'orange'}>{CMS_EDITORIAL_OBSERVATION_LABELS[observation.outcome]}</Tag>}>
    <Typography.Paragraph type="tertiary">观察截至 <DateTimeText value={observation.dueAt} mode="absolute" />；迟到数据结算 <DateTimeText value={observation.settlesAt} mode="absolute" /></Typography.Paragraph>
    {observation.before && observation.after ? <>
      <Typography.Paragraph>前后使用等长区间，覆盖状态：发布前{observation.before.coverage.available ? '完整' : '不足'} / 发布后{observation.after.coverage.available ? '完整' : '不足'}。</Typography.Paragraph>
      <Typography.Paragraph type="tertiary">发布前：<DateTimeText value={observation.before.window.startTime} mode="absolute" /> 至 <DateTimeText value={observation.before.window.endTime} mode="absolute" /><br />发布后：<DateTimeText value={observation.after.window.startTime} mode="absolute" /> 至 <DateTimeText value={observation.after.window.endTime} mode="absolute" />（结束边界不含）</Typography.Paragraph>
      <ConfigurableTable pagination={false} rowKey="key" columns={[{ title: '指标', dataIndex: 'label' }, { title: '发布前', dataIndex: 'before' }, { title: '发布后', dataIndex: 'after' }]} dataSource={pairs.map(({ key, label }) => ({ key, label, before: observation.before!.metrics[key], after: observation.after!.metrics[key] }))} />
      {goal && goal.metric !== 'manual' ? <Typography.Paragraph>{CMS_EDITORIAL_GOAL_METRIC_LABELS[goal.metric]}：{metricValue(observation.before, goal.metric)}% → {metricValue(observation.after, goal.metric)}%；目标{goal.metric === 'no_result_rate' ? '不高于' : '不低于'} {goal.targetValue}%，前后样本均需至少 {goal.minSample}。</Typography.Paragraph> : null}
    </> : <Typography.Paragraph type="tertiary">尚未生成可查看的完整统计证据。</Typography.Paragraph>}
    {observation.otherActivationIds.length ? <Banner type="warning" description={`观察期间另有 ${observation.otherActivationIds.length} 次站点激活，记录 #${observation.otherActivationIds.join('、#')}。指标变化不能直接证明本次编辑的因果效果。`} /> : null}
  </Card>;
}

function TaskActions({ task }: Readonly<{ task: CmsEditorialTaskDetail }>) {
  const { hasPermission } = usePermission();
  const content = useCmsContentDetail(task.contentId ?? undefined, !!task.contentId && hasPermission('cms:content:list'));
  const complete = useCompleteCmsEditorialTask(), verify = useVerifyCmsEditorialTask(), reopen = useReopenCmsEditorialTask(), refresh = useRefreshCmsEditorialObservations();
  const [version, setVersion] = useState(task.version);
  const [metric, setMetric] = useState<CmsEditorialGoal['metric']>(task.source === 'search' ? 'no_result_rate' : 'manual');
  const [targetValue, setTargetValue] = useState(0), [minSample, setMinSample] = useState(30), [description, setDescription] = useState(''), [note, setNote] = useState('');
  const [revisionId, setRevisionId] = useState<number>();
  const [reopening, setReopening] = useState(false);
  const round = task.rounds.find(row => row.roundNo === task.roundNo);
  const final = task.observations.find(row => row.roundId === round?.id && row.windowDays === 30 && row.outcome === 'improved');
  const pending = complete.isPending || verify.isPending || reopen.isPending || refresh.isPending;
  const stale = version !== task.version;
  const revisions = [...new Set([content.data?.approvedRevisionId, content.data?.publishedRevisionId].filter((id): id is number => !!id))];
  const chosen = revisionId ?? content.data?.approvedRevisionId ?? content.data?.publishedRevisionId ?? undefined;
  const editing = ['open', 'in_progress'].includes(task.status);
  const canVerify = ['online', 'observing'].includes(task.status) && !!round?.activatedAt && !round.interruptedAt && (round.goal?.metric === 'manual' || (!!final && task.canViewMetrics));
  if (!hasPermission('cms:editorial-task:manage')) return null;
  return <Card title="本轮处理">
    {stale ? <Banner type="warning" description="事项已被更新，输入已保留。请重新打开侧栏后再提交。" /> : null}
    <Space vertical align="start" spacing={12} style={{ width: '100%' }}>
      {editing && !reopening ? <>
        <Typography.Text>完成编辑会锁定解决修订与目标；后续发布必须激活同一修订。</Typography.Text>
        <Select aria-label="解决修订" placeholder={task.contentId ? '选择已审核的解决修订' : '请先编辑事项并关联稿件'} value={chosen} onChange={value => setRevisionId(Number(value))} loading={content.isFetching} disabled={!revisions.length || pending} optionList={revisions.map(value => ({ value, label: `修订 #${value}${value === content.data?.approvedRevisionId ? ' · 已审核' : ' · 当前已发布'}` }))} style={{ width: '100%' }} />
        <Select aria-label="复盘指标" value={metric} onChange={value => setMetric(value as CmsEditorialGoal['metric'])} disabled={pending} optionList={Object.entries(CMS_EDITORIAL_GOAL_METRIC_LABELS).filter(([value]) => task.source === 'search' ? value === 'no_result_rate' : value !== 'no_result_rate' && (task.canViewMetrics || value === 'manual')).map(([value, label]) => ({ value, label }))} style={{ width: '100%' }} />
        {metric !== 'manual' ? <Space wrap><Typography.Text>目标百分比</Typography.Text><InputNumber aria-label="目标百分比" min={0} max={100} value={targetValue} onChange={value => setTargetValue(Number(value))} /><Typography.Text>最低样本量</Typography.Text><InputNumber aria-label="最低样本量" min={30} max={1000000} value={minSample} onChange={value => setMinSample(Number(value))} /></Space> : null}
        <TextArea aria-label="处理目标" value={description} onChange={setDescription} placeholder="描述可验证的处理目标，例如补充完整办事指南" maxCount={1000} />
      </> : null}
      <TextArea aria-label={reopening ? '重开原因' : '本轮处理说明'} value={note} onChange={setNote} placeholder={reopening ? '说明再次出现的问题，原轮次及证据会保留' : '填写编辑完成说明或人工核验依据'} maxCount={5000} />
      <Space wrap>
        {editing && !reopening ? <Button theme="solid" disabled={stale || pending || !chosen || !description.trim() || !note.trim() || (metric !== 'manual' && !task.canViewMetrics)} loading={complete.isPending} onClick={async () => { await complete.mutateAsync({ params: { id: task.id }, body: { expectedVersion: version, revisionId: chosen!, goal: { metric, targetValue, minSample, description }, note } }); Toast.success('已锁定解决修订，等待实际发布激活'); }}>完成编辑</Button> : null}
        {canVerify && !reopening ? <Button theme="solid" disabled={stale || pending || !note.trim()} loading={verify.isPending} onClick={async () => { await verify.mutateAsync({ params: { id: task.id }, body: { expectedVersion: version, observationId: round?.goal?.metric === 'manual' ? null : final!.id, note } }); Toast.success('复盘验证已记录'); }}>确认复盘验证</Button> : null}
        {round?.activatedAt && task.canViewMetrics && !reopening ? <Button disabled={stale || pending} loading={refresh.isPending} onClick={async () => { const next = await refresh.mutateAsync({ params: { id: task.id }, body: { expectedVersion: version } }); setVersion(next.version); }}>更新观察结果</Button> : null}
        {!editing && !reopening ? <Button disabled={pending} onClick={() => { setReopening(true); setNote(''); }}>开启新一轮处理</Button> : null}
        {reopening ? <><Button onClick={() => setReopening(false)} disabled={pending}>取消重开</Button><Button theme="solid" disabled={stale || pending || !note.trim()} loading={reopen.isPending} onClick={async () => { await reopen.mutateAsync({ params: { id: task.id }, body: { expectedVersion: version, reason: note } }); Toast.success('已开启新一轮，原处理历史保留'); }}>确认重开</Button></> : null}
      </Space>
      {task.source === 'search' && !task.canViewMetrics ? <Banner type="warning" description="搜索问题需要整站访问统计权限才能设置指标目标和验证结果。" /> : null}
      <Typography.Paragraph type="tertiary">7 天用于中期观察；指标验证需完整 30 天和迟到结算期，前后覆盖完整、样本足够且达到改善目标。人工核验只记录事实与依据。</Typography.Paragraph>
    </Space>
  </Card>;
}

export default function CmsEditorialTaskSheet({ id, onClose, onEdit }: Readonly<{ id?: number; onClose: () => void; onEdit: (task: CmsEditorialTask) => void }>) {
  const detail = useCmsEditorialTaskDetail(id), navigate = useNavigate(), { hasPermission } = usePermission();
  const task = detail.data;
  return <SideSheet title={task ? `事项复盘 · ${task.title}` : '事项复盘'} visible={!!id} onCancel={onClose} width={1000}>
    <Spin spinning={detail.isLoading}>
      {detail.isError ? <Banner type="danger" description={detail.error.message} /> : null}
      {task ? <Space vertical align="start" spacing={16} style={{ width: '100%' }}>
        <Descriptions align="left" data={[{ key: '状态', value: CMS_EDITORIAL_TASK_STATUS_LABELS[task.status] }, { key: '处理轮次', value: task.roundNo }, { key: '来源', value: CMS_EDITORIAL_TASK_SOURCE_LABELS[task.source] }, { key: '负责人', value: task.ownerName ?? '未分派' }]} />
        <Space wrap><Button onClick={() => onEdit(task)}>编辑事项信息</Button>{task.contentId && hasPermission('cms:content:list') ? <Button onClick={() => navigate(`/cms/contents/edit?id=${task.contentId}&siteId=${task.siteId}`)}>查看稿件</Button> : null}{hasPermission('cms:stat:view') ? <Button onClick={() => navigate(`/cms/stats?siteId=${task.siteId}${task.contentId ? `&contentId=${task.contentId}` : ''}`)}>访问统计</Button> : null}{task.feedbackId && hasPermission('cms:form:list') ? <Button onClick={() => navigate(`/cms/forms?siteId=${task.siteId}&feedback=${task.feedbackId}`)}>来源来信</Button> : null}</Space>
        <TaskActions key={`${task.id}:${task.roundNo}:${task.status}`} task={task} />
        {task.rounds.map(round => <Card key={round.id} title={`第 ${round.roundNo} 轮${round.roundNo === task.roundNo ? ' · 当前' : ''}`} style={{ width: '100%' }}>
          <Typography.Paragraph>{round.sourceEvidence.summary}</Typography.Paragraph>
          <Typography.Paragraph type="tertiary">证据采集 <DateTimeText value={round.sourceEvidence.capturedAt} mode="absolute" />{round.sourceEvidence.snapshot ? <> · 来源区间 <DateTimeText value={round.sourceEvidence.snapshot.window.startTime} mode="absolute" /> 至 <DateTimeText value={round.sourceEvidence.snapshot.window.endTime} mode="absolute" /></> : null}</Typography.Paragraph>
          {round.goal ? <Typography.Paragraph>目标：{round.goal.description}（{CMS_EDITORIAL_GOAL_METRIC_LABELS[round.goal.metric]}）</Typography.Paragraph> : null}
          {round.solutionRevisionId ? <Typography.Paragraph>解决修订 #{round.solutionRevisionId} · {round.activatedAt ? <>实际上线 <DateTimeText value={round.activatedAt} mode="absolute" /></> : '等待发布激活'}{round.releaseId && hasPermission('cms:publish:view') ? <Button theme="borderless" onClick={() => navigate(`/cms/publishing?tab=releases&site=${task.siteId}&siteId=${task.siteId}&release=${round.releaseId}`)}>发布单 #{round.releaseId}</Button> : null}</Typography.Paragraph> : null}
          {round.interruptedAt ? <Banner type="warning" description={round.interruptionReason ?? '本轮观察已中断，请重开事项继续处理'} /> : null}
          <Space vertical align="start" spacing={12} style={{ width: '100%' }}>{task.observations.filter(row => row.roundId === round.id).map(observation => <Observation key={observation.id} observation={observation} goal={round.goal} />)}</Space>
        </Card>)}
        <Card title="处理历史" style={{ width: '100%' }}>{task.history.map(item => <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--semi-color-border)' }}><Space wrap><Tag>{CMS_EDITORIAL_TASK_HISTORY_ACTION_LABELS[item.action] ?? item.action}</Tag><Typography.Text>第 {item.roundNo} 轮 · {item.actorName ?? '系统'}</Typography.Text><DateTimeText value={item.createdAt} mode="absolute" /></Space>{item.note ? <Typography.Paragraph>{item.note}</Typography.Paragraph> : null}</div>)}</Card>
      </Space> : null}
    </Spin>
  </SideSheet>;
}
