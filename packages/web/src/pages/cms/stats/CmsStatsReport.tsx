import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Select, Toast, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { CmsStatMetrics, CmsStatReportRow } from '@zenith/shared/cms';
import ConfigurableTable from '@/components/ConfigurableTable';
import ExportButton from '@/components/ExportButton';
import { KeywordInput } from '@/components/search-filters';
import { ListSearchToolbar, listTableProps } from '@/components/list-page';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { useListSearch } from '@/hooks/useListSearch';
import { useFilterQuery } from '@/hooks/useFilterQuery';
import { usePermission } from '@/hooks/usePermission';
import { useCmsStatsReport, cmsStatKeys, type CmsStatsQuery, type CmsStatsReportQuery } from '@/hooks/queries/cms-stats';
import { useCreateCmsEditorialTask } from '@/hooks/queries/cms-operations';
import { renderEllipsis } from '@/utils/table-columns';
import { useCmsTaskEditor } from '../CmsEditorialTasks';
import { cmsStatsDimensionLabel, DIMENSION_LABELS, METRIC_LABELS, displayCmsMetric, type CmsStatsDimension } from './cms-stats-presentation';

interface ReportFilters { keyword?: string; sortBy: NonNullable<CmsStatsReportQuery['sortBy']>; sortOrder: 'asc' | 'desc' }
const STANDARD_COLUMNS: (keyof CmsStatMetrics)[] = ['pv', 'uv', 'sessions', 'reads', 'readRate', 'avgActiveMs', 'engagementRate', 'conversions', 'conversionRate'];
const SEARCH_COLUMNS: (keyof CmsStatMetrics)[] = ['searches', 'uv', 'noResultSearches', 'searchClicks', 'searchClickRate', 'reads', 'conversions'];
const MEDIA_COLUMNS: (keyof CmsStatMetrics)[] = ['uv', 'mediaStarts', 'media25', 'media50', 'media75', 'mediaCompletions', 'mediaErrors', 'downloadClicks', 'downloads'];
const PLACEMENT_COLUMNS: (keyof CmsStatMetrics)[] = ['impressions', 'clicks', 'ctr', 'uv', 'conversions'];
const FORM_COLUMNS: (keyof CmsStatMetrics)[] = ['uv', 'formStarts', 'formErrors', 'formCompletions'];
const INTERACTION_COLUMNS: (keyof CmsStatMetrics)[] = ['uv', 'votes', 'comments', 'follows', 'conversions'];

export default function CmsStatsReport({ query: scopeQuery, dimension, onDrill }: Readonly<{
  query: CmsStatsQuery; dimension: CmsStatsDimension; onDrill?: (dimension: CmsStatsDimension, key: string) => void;
}>) {
  const columnsToShow = dimension === 'search' ? SEARCH_COLUMNS : dimension === 'media' ? MEDIA_COLUMNS : dimension === 'placement' ? PLACEMENT_COLUMNS : dimension === 'form' ? FORM_COLUMNS : dimension === 'interaction' ? INTERACTION_COLUMNS : STANDARD_COLUMNS;
  const defaultSort = dimension === 'search' ? 'searches' : dimension === 'media' ? 'mediaStarts' : dimension === 'placement' ? 'impressions' : ['form', 'interaction'].includes(dimension) ? 'conversions' : 'pv';
  const { watermark: _watermark, ...scopeFilters } = scopeQuery;
  const search = useListSearch<ReportFilters>({ defaults: { sortBy: defaultSort, sortOrder: 'desc' }, listKey: cmsStatKeys.report, resetKey: JSON.stringify(scopeFilters) });
  const reportQuery = useFilterQuery({ ...scopeQuery, ...search.submittedParams, dimension });
  const report = useCmsStatsReport({ ...reportQuery, siteId: scopeQuery.siteId, page: search.page, pageSize: search.pageSize });
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const createTask = useCreateCmsEditorialTask();
  const editor = useCmsTaskEditor(scopeQuery.siteId);
  const sortFields: NonNullable<CmsStatsReportQuery['sortBy']>[] = ['pv', 'uv', 'sessions', 'reads', 'activeMs', 'conversions', 'searches', 'noResultSearches', 'searchClicks', 'downloads', 'impressions', 'clicks', 'mediaStarts', 'mediaErrors'];
  /** 指标列宽跟随标题长度：6 字及以上（搜索结果点击、区间访客 UV…）给 140，避免表头换行。 */
  const metricColumnWidth = (field: keyof CmsStatMetrics) => field === 'avgActiveMs' ? 160 : METRIC_LABELS[field].length >= 6 ? 140 : 115;
  const columns: ColumnProps<CmsStatReportRow>[] = [
    { title: DIMENSION_LABELS[dimension], dataIndex: 'label', minWidth: 300, render: (label: string, row) => dimension === 'content' && /^\d+$/u.test(row.key) ? <Typography.Text link ellipsis={{ showTooltip: true }} style={{ maxWidth: '100%', '--semi-color-link': 'var(--semi-color-primary)', '--semi-color-link-hover': 'var(--semi-color-primary-hover)', '--semi-color-link-active': 'var(--semi-color-primary-active)', '--semi-color-link-visited': 'var(--semi-color-primary)' } as CSSProperties} onClick={() => navigate(`/cms/contents/edit?id=${row.key}&siteId=${scopeQuery.siteId}`)}>{label}</Typography.Text> : renderEllipsis(cmsStatsDimensionLabel(dimension, row.key, label)) },
    ...columnsToShow.map((field): ColumnProps<CmsStatReportRow> => ({ title: METRIC_LABELS[field], dataIndex: field, width: metricColumnWidth(field), align: 'right', render: (_value: number, row) => displayCmsMetric(row, field) })),
  ];
  const drillable = ['content', 'channel', 'author', 'contentType', 'release', 'source', 'device'].includes(dimension);
  if (drillable || dimension === 'search') columns.push(createOperationColumn<CmsStatReportRow>({ width: dimension === 'search' ? 150 : 110, desktopInlineKeys: ['drill', 'task'], actions: (row) => {
    if (dimension === 'search') return row.noResultSearches > 0 && hasPermission('cms:editorial-task:manage') ? [{ key: 'task', label: '转为编辑事项', disabled: createTask.isPending, onClick: async () => {
      const task = await createTask.mutateAsync({ body: { siteId: scopeQuery.siteId, title: `补充内容：${row.label}`, description: `读者搜索“${row.label}”出现 ${row.noResultSearches} 次无结果。`, source: 'search', sourceKeyword: row.label, ...(report.data?.scope ? { sourceWindow: { startTime: report.data.scope.startTime, endTime: report.data.scope.endTime, watermark: report.data.scope.watermark, timeZone: report.data.scope.timeZone } } : {}) } });
      Toast.success('已打开对应编辑事项'); editor.openEdit(task);
    } }] : [];
    return onDrill && row.key !== 'unknown' && row.key !== '' ? [{ key: 'drill', label: '按此项筛选', onClick: () => onDrill(dimension, row.key) }] : [];
  } }));
  return <>
    <ListSearchToolbar onSearch={search.handleSearch} onReset={search.handleReset}
      keyword={<KeywordInput {...search.bindKeyword('keyword')} placeholder={`搜索${DIMENSION_LABELS[dimension]}名称`} />}
      filters={<><Select aria-label="排序指标" {...search.bind('sortBy', (value: unknown) => value as ReportFilters['sortBy'])} optionList={sortFields.map((value) => ({ value, label: `按${METRIC_LABELS[value]}` }))} /><Select aria-label="排序方向" {...search.bind('sortOrder', (value: unknown) => value as ReportFilters['sortOrder'])} optionList={[{ value: 'desc', label: '从高到低' }, { value: 'asc', label: '从低到高' }]} /></>}
      actions={<ExportButton entity="cms.statistics" permission="cms:stat:view" query={reportQuery} executionMode="async" label="后台导出全部结果" />} />
    <Typography.Paragraph type="tertiary">导出任务在后台生成完整统计快照，关闭页面后继续执行；可在<Typography.Text link onClick={() => navigate('/system/export-jobs')}>导出中心</Typography.Text>查看进度、取消、重试和重复下载。</Typography.Paragraph>
    {report.isError ? <Banner type="danger" description={`排行查询失败：${report.error.message}${report.data ? '。下方保留上次成功结果。' : ''}`} /> : null}
    {['search', 'media', 'placement', 'form', 'interaction'].includes(dimension) ? <Typography.Paragraph type="tertiary">此维度的 UV 是发生对应行为的访客数；详情浏览和搜索、媒体、版位行为分别计量，不将点击等同于服务端成功。</Typography.Paragraph> : null}
    <ConfigurableTable columnSettingsKey={`cms-statistics-${dimension}`} columns={columns} {...listTableProps(report, { rowKey: 'key', pagination: search.buildPagination, empty: report.isError ? '查询失败，请刷新重试' : '当前筛选下暂无对应事件' })} />
    {dimension === 'search' ? <Typography.Paragraph type="tertiary">转为事项时保存当前时间区间的全站关键词证据，后续按同一关键词跟踪发布前后效果。</Typography.Paragraph> : null}
    {editor.editor}
  </>;
}
