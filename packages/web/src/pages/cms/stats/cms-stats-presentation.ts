import { isCmsStatMetricAvailable, type CmsStatMetrics } from '@zenith/shared/cms';
import { ANALYTICS_DEVICE_TYPE_LABELS, type AnalyticsDeviceType } from '@zenith/shared/analytics';
import type { CmsStatsReportQuery } from '@/hooks/queries/cms-stats';
import dayjs from 'dayjs';

export type CmsStatsDimension = NonNullable<CmsStatsReportQuery['dimension']>;
export function cmsStatsDimensionLabel(dimension: CmsStatsDimension, key: string, label: string): string {
  return dimension === 'device' ? ANALYTICS_DEVICE_TYPE_LABELS[key as AnalyticsDeviceType] ?? label : label;
}
export { CMS_STAT_DIMENSION_LABELS as DIMENSION_LABELS, CMS_STAT_METRIC_LABELS as METRIC_LABELS } from '@zenith/shared/cms';
const RATES = new Set<keyof CmsStatMetrics>(['engagementRate', 'bounceRate', 'conversionRate', 'ctr', 'avgScrollDepth', 'readRate', 'searchClickRate']);
export function formatCmsMetric(key: keyof CmsStatMetrics, value: number): string {
  if (RATES.has(key)) return `${value.toFixed(1)}%`;
  if (key === 'activeMs' || key === 'avgActiveMs') return value < 60_000 ? `${(value / 1000).toFixed(1)} 秒` : `${(value / 60_000).toFixed(1)} 分钟`;
  return value.toLocaleString('zh-CN');
}
export function displayCmsMetric(metrics: CmsStatMetrics, key: keyof CmsStatMetrics): string {
  if (!isCmsStatMetricAvailable(metrics, key)) return '—';
  return formatCmsMetric(key, metrics[key]);
}
/** CSV quoting also prevents spreadsheet formula execution from reader-controlled keywords. */
export function cmsStatsCsvCell(value: string | number): string {
  const text = String(value);
  return `"${(/^[=+\-@\t\r]/u.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}
export function cmsStatsCsv(rows: readonly (readonly (string | number)[])[]): string {
  return '\uFEFF' + rows.map((row) => row.map(cmsStatsCsvCell).join(',')).join('\r\n');
}

export function cmsStatsDateRange(timeZone: string, now = new Date()): [Date, Date] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const today = dayjs(`${part('year')}-${part('month')}-${part('day')}`);
  return [today.subtract(29, 'day').startOf('day').toDate(), today.endOf('day').toDate()];
}
export function formatCmsScopeTime(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value.replace(' ', 'T')));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}
