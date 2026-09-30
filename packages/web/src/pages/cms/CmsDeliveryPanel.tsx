import { useRef, useState } from 'react';
import { Banner, Button, Descriptions, Form, SideSheet, Space, Tag, Typography } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { BodyOf } from '@zenith/shared/core';
import { CMS_DELIVERY_CAUSE_LABELS, CMS_DELIVERY_PURGE_LABELS, CMS_DELIVERY_STATUS_LABELS, cmsDeliveryContract, type CmsDeliveryConfig, type CmsDeliveryRunSummary, type CmsDeliveryObservation } from '@zenith/shared/cms';
import { useNavigate } from 'react-router-dom';
import { useCmsDeliveryConfig, useCmsDeliveryRuns, useCmsDeliveryRun, useSaveCmsDeliveryConfig, useStartCmsDelivery, useRetryCmsDelivery } from '@/hooks/queries/cms-delivery';
import { usePagination } from '@/hooks/usePagination';
import { usePermission } from '@/hooks/usePermission';
import { useListDeepLink } from '@/hooks/useListDeepLink';
import { listTableProps } from '@/components/list-page';
import { ModalFooter } from '@/components/ModalFooter';
import AppModal from '@/components/AppModal';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { dateTimeColumn, renderEllipsis } from '@/utils/table-columns';
import { CmsSiteSelect } from './CmsSiteSelect';

const statusColor = (status: CmsDeliveryRunSummary['status']) => status === 'passed' ? 'green' : status === 'failed' ? 'red' : status === 'superseded' || status === 'unverified' ? 'grey' : 'blue';
type ConfigValues = Omit<BodyOf<typeof cmsDeliveryContract.saveConfig>, 'paths'> & { pathsText: string };

export function CmsDeliveryRunSheet({ id, onClose, onRetry }: Readonly<{ id?: number; onClose: () => void; onRetry?: (id: number) => void }>) {
  const detail = useCmsDeliveryRun(id), retry = useRetryCmsDelivery(), navigate = useNavigate();
  const { hasPermission } = usePermission(); const run = detail.data;
  return <SideSheet title="实际交付记录" visible={!!id} onCancel={onClose} width={1120}>
    {detail.isError ? <Banner type="danger" description={detail.error.message} /> : !run ? <Typography.Text>正在加载交付记录…</Typography.Text> : <>
      <Space wrap style={{ marginBottom: 12 }}><Tag color={statusColor(run.status)}>{CMS_DELIVERY_STATUS_LABELS[run.status]}</Tag><Typography.Text>{CMS_DELIVERY_CAUSE_LABELS[run.cause]}</Typography.Text>
        {hasPermission('cms:publish:manage') && ['passed', 'unverified', 'failed'].includes(run.status) ? <Button loading={retry.isPending} onClick={async () => { const next = await retry.mutateAsync({ params: { id: run.id } }); onRetry?.(next.id); }}>按当前入口重新检测</Button> : null}
        {run.releaseId ? <Button onClick={() => { onClose(); navigate(`/cms/publishing?tab=releases&site=${run.siteId}&release=${run.releaseId}`); }}>查看发布单 #{run.releaseId}</Button> : null}
      </Space>
      <Descriptions align="left" data={[
        { key: '预期公开代次', value: run.generationId ?? '尚未激活' }, { key: '预期发布单', value: run.releaseId ?? '—' },
        { key: '可见性版本', value: run.visibilityEpoch }, { key: '入口配置版本', value: run.configVersion },
        { key: '源站入口', value: run.sourceBaseUrl ?? '未配置' }, { key: '公开 / CDN 入口', value: run.publicBaseUrl ?? '未配置' },
        { key: '缓存刷新请求', value: `${CMS_DELIVERY_PURGE_LABELS[run.purgeStatus]}${run.purgeHttpStatus ? ` · HTTP ${run.purgeHttpStatus}` : ''}` },
        { key: '任务', value: run.taskId ? `#${run.taskId}` : '—' },
      ]} />
      <Typography.Paragraph type="tertiary">记录保留当次入口及版本。源站和公开入口分别检测，公开入口未配置时显示未验证；刷新请求响应后，仍会检查页面内容标记。</Typography.Paragraph>
      {run.purgeMessage ? <Typography.Paragraph>{run.purgeMessage}</Typography.Paragraph> : null}
      {run.error ? <Banner type="warning" description={run.error} /> : null}
      <ConfigurableTable<CmsDeliveryObservation & { key: string }> rowKey="key" pagination={{ pageSize: 10 }} dataSource={run.observations.map((row, index) => ({ ...row, key: `${row.target}:${row.path}:${index}` }))} columns={[
        { title: '入口', dataIndex: 'target', width: 115, render: value => value === 'source' ? '源站' : '公开 / CDN' },
        { title: '对象', width: 75, render: (_, row) => run.paths.find(path => path.path === row.path)?.kind === 'asset' ? '素材' : '页面' },
        { title: '路径', dataIndex: 'path', minWidth: 190, render: value => renderEllipsis(value) },
        { title: '预期', width: 100, render: (_, row) => run.paths.find(path => path.path === row.path)?.expectedStatus === 'withdrawn' ? '不可公开访问' : '当前版本可见' },
        { title: '结果', dataIndex: 'status', width: 105, render: value => <Tag color={value === 'passed' ? 'green' : value === 'failed' ? 'red' : 'grey'}>{value === 'passed' ? '通过' : value === 'failed' ? '异常' : '未验证'}</Tag> },
        { title: 'HTTP', dataIndex: 'httpStatus', width: 80, render: value => value ?? '—' },
        { title: '实际版本', width: 190, render: (_, row) => run.paths.find(path => path.path === row.path)?.kind === 'asset' ? '素材按访问状态判断' : row.generationId ? `代次 ${row.generationId} / 发布 ${row.releaseId ?? '—'} / 可见性 ${row.visibilityEpoch ?? '—'}` : '未读取到标记' },
        { title: '缓存信息', width: 140, render: (_, row) => renderEllipsis([row.cacheStatus, row.age ? `Age ${row.age}` : null].filter(Boolean).join(' · ') || '—') },
        { title: '说明', dataIndex: 'message', minWidth: 270, render: value => renderEllipsis(value) },
        dateTimeColumn('检测时间', 'checkedAt'),
      ]} />
      {!run.observations.length ? <Typography.Paragraph type="tertiary">尚无页面观测结果。{run.paths.length ? `本次安排 ${run.paths.length} 条关键路径。` : ''}</Typography.Paragraph> : null}
    </>}
  </SideSheet>;
}

/** Also used inside a release's detail panel so activation and delivery evidence remain adjacent. */
export function CmsReleaseDelivery({ siteId, releaseId }: Readonly<{ siteId: number; releaseId: number }>) {
  const rows = useCmsDeliveryRuns({ siteId, releaseId, page: 1, pageSize: 1 }); const [id, setId] = useState<number>();
  const latest = rows.data?.list[0];
  return <>
    <Space wrap><Typography.Text strong>实际交付</Typography.Text>{latest ? <><Tag color={statusColor(latest.status)}>{CMS_DELIVERY_STATUS_LABELS[latest.status]}</Tag><Button size="small" onClick={() => setId(latest.id)}>查看入口与页面证据</Button></> : <Typography.Text type="tertiary">{rows.isError ? '交付记录读取失败' : '暂无实际交付检测记录'}</Typography.Text>}</Space>
    <CmsDeliveryRunSheet id={id} onClose={() => setId(undefined)} onRetry={setId} />
  </>;
}

export default function CmsDeliveryPanel() {
  const { hasPermission } = usePermission(); const canManage = hasPermission('cms:publish:manage');
  const [siteId, setSiteId] = useState<number>(), [detailId, setDetailId] = useState<number>(), [editing, setEditing] = useState<CmsDeliveryConfig>();
  const form = useRef<FormApi | null>(null); const pagination = usePagination({ resetKey: siteId });
  const list = useCmsDeliveryRuns({ siteId: siteId ?? 0, page: pagination.page, pageSize: pagination.pageSize });
  const config = useCmsDeliveryConfig(siteId), save = useSaveCmsDeliveryConfig(), start = useStartCmsDelivery();
  useListDeepLink(['delivery'], picked => { const id = Number(picked.delivery); if (Number.isSafeInteger(id) && id > 0) setDetailId(id); });
  return <div className="zx-flat-panels">
    <Space wrap style={{ marginBottom: 14 }}><CmsSiteSelect value={siteId} onChange={id => { setSiteId(id); setEditing(undefined); setDetailId(undefined); }} width={240} />
      {canManage ? <><Button disabled={!config.data} onClick={() => setEditing(config.data)}>配置交付入口</Button><Button theme="solid" disabled={!siteId} loading={start.isPending} onClick={async () => { const run = await start.mutateAsync({ body: { siteId: siteId! } }); setDetailId(run.id); }}>检测当前公开版本</Button></> : null}
      <Button disabled={!siteId} onClick={() => { void list.refetch(); void config.refetch(); }}>刷新记录</Button>
    </Space>
    {config.data ? <Typography.Paragraph type="tertiary">源站：{config.data.effectiveSourceBaseUrl ?? '未配置'} · 公开入口：{config.data.publicBaseUrl ?? '未配置'}</Typography.Paragraph> : null}
    {list.isError || config.isError ? <Banner type="danger" description={list.error?.message ?? config.error?.message} /> : null}
    <ConfigurableTable<CmsDeliveryRunSummary> columnSettingsKey="cms-delivery-runs" columns={[
      { title: '记录', dataIndex: 'id', width: 85, render: value => `#${value}` },
      { title: '触发原因', dataIndex: 'cause', width: 135, render: (value: CmsDeliveryRunSummary['cause']) => CMS_DELIVERY_CAUSE_LABELS[value] },
      { title: '状态', dataIndex: 'status', width: 160, render: (value: CmsDeliveryRunSummary['status']) => <Tag color={statusColor(value)}>{CMS_DELIVERY_STATUS_LABELS[value]}</Tag> },
      { title: '发布 / 代次', width: 145, render: (_, row) => `${row.releaseId ?? '—'} / ${row.generationId ?? '—'}` },
      { title: '可见性版本', dataIndex: 'visibilityEpoch', width: 110 },
      { title: '缓存刷新', dataIndex: 'purgeStatus', width: 155, render: (value: CmsDeliveryRunSummary['purgeStatus']) => CMS_DELIVERY_PURGE_LABELS[value] },
      { title: '异常说明', dataIndex: 'error', minWidth: 220, render: value => renderEllipsis(value ?? '—') },
      dateTimeColumn('创建时间', 'createdAt'),
      createOperationColumn<CmsDeliveryRunSummary>({ width: 110, desktopInlineKeys: ['detail'], actions: row => [{ key: 'detail', label: '查看证据', onClick: () => setDetailId(row.id) }] }),
    ]} {...listTableProps(list, { rowKey: 'id', pagination: pagination.buildPagination, empty: siteId ? '激活发布单后记录实际交付情况' : '请选择站点' })} />
    <CmsDeliveryRunSheet id={detailId} onClose={() => setDetailId(undefined)} onRetry={setDetailId} />
    <AppModal title="配置交付入口" visible={!!editing} onCancel={() => setEditing(undefined)} width={720} footer={<ModalFooter onCancel={() => setEditing(undefined)} onOk={() => form.current?.submitForm()} okText="保存入口配置" loading={save.isPending} />}>
      {editing ? <Form<ConfigValues> key={`${editing.siteId}:${editing.version}`} getFormApi={api => { form.current = api; }} initValues={{ sourceBaseUrl: editing.sourceBaseUrl, publicBaseUrl: editing.publicBaseUrl, expectedVersion: editing.version, pathsText: editing.paths.join('\n') }} onSubmit={async values => {
        await save.mutateAsync({ query: { siteId: editing.siteId }, body: { expectedVersion: values.expectedVersion, sourceBaseUrl: values.sourceBaseUrl?.trim() || null, publicBaseUrl: values.publicBaseUrl?.trim() || null, paths: [...new Set(values.pathsText.split(/\r?\n/u).map(path => path.trim()).filter(Boolean))] } });
        setEditing(undefined);
      }}>
        <Form.Input field="sourceBaseUrl" label="源站入口" placeholder={editing.effectiveSourceBaseUrl ?? 'https://origin.example.com'} extraText="填写站点入口地址，包含站点路径前缀。留空时使用系统配置的源站入口。" />
        <Form.Input field="publicBaseUrl" label="公开 / CDN 入口" placeholder="https://www.example.com" extraText="填写读者实际访问的地址；未配置时公开交付状态为未验证。" />
        <Form.TextArea field="pathsText" label="关键页面路径" rows={6} rules={[{ required: true, message: '请至少填写首页路径 /' }]} extraText="每行一个站内路径，最多20条，例如 /、/news/、/p/culture/。不要添加查询参数。" />
      </Form> : null}
    </AppModal>
  </div>;
}
