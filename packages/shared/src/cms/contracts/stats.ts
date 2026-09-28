import * as z from 'zod';
import { dateRangeQuery, filterMeta, idQuery, keywordQuery, paginated, paginationQuery, queryEnum, requiredIdQuery } from '../../core';
import { defineContract, op } from '../../core/contract';
import { CMS_CONTENT_TYPES, CMS_DEVICE_TYPES } from '../constants';
import { CMS_STAT_COMPARISONS, CMS_STAT_DIMENSIONS, CMS_STAT_GRANULARITIES, CMS_STAT_SORT_FIELDS, CMS_STAT_SORT_ORDERS, CMS_STAT_STATUSES, isCmsStatTimeZone } from '../cms-statistics';

// ─── 实体 ────────────────────────────────────────────────────────────────────

const cmsDayMetricSchema = z.object({ pv: z.int(), uv: z.int(), ips: z.int() });

/** CMS 访问统计总览（bot 流量不计入） */
export const cmsVisitStatsSchema = z.object({
  today: cmsDayMetricSchema,
  yesterday: cmsDayMetricSchema,
  totalPv: z.int().meta({ description: '统计区间累计 PV（不含爬虫）' }),
  trend: z.array(z.object({ date: z.string(), pv: z.int(), uv: z.int() })),
  topContents: z.array(z.object({
    contentId: z.int(),
    title: z.string(),
    pv: z.int(),
    uv: z.int(),
  })),
  devices: z.array(z.object({ deviceType: z.enum(CMS_DEVICE_TYPES), pv: z.int() })),
  referrers: z.array(z.object({ host: z.string(), pv: z.int() })),
}).meta({ id: 'CmsVisitStats' });

export type CmsVisitStats = z.infer<typeof cmsVisitStatsSchema>;

/** CMS 搜索分析 */
export const cmsSearchAnalyticsSchema = z.object({
  total: z.int(),
  trend: z.array(z.object({ date: z.string(), count: z.int() })),
  topKeywords: z.array(z.object({ keyword: z.string(), count: z.int(), avgResults: z.int() })),
  noResultKeywords: z.array(z.object({ keyword: z.string(), count: z.int() })).meta({ description: '无结果搜索词榜（内容选题参考）' }),
}).meta({ id: 'CmsSearchAnalytics' });

export type CmsSearchAnalytics = z.infer<typeof cmsSearchAnalyticsSchema>;

export const cmsStatMetricsSchema = z.object({
  pv: z.int(), uv: z.int(), sessions: z.int(), newVisitors: z.int(), returningVisitors: z.int(), reads: z.int(), readRate: z.number(),
  activeMs: z.number(), avgActiveMs: z.number(), avgScrollDepth: z.number(), engagedSessions: z.int(), engagementRate: z.number(), bounceRate: z.number(),
  conversions: z.int(), conversionVisitors: z.int(), conversionRate: z.number(),
  searches: z.int(), noResultSearches: z.int(), uniqueKeywords: z.int(), noResultKeywords: z.int(), searchClicks: z.int(), searchClickRate: z.number(),
  downloadClicks: z.int(), downloads: z.int(), formStarts: z.int(), formErrors: z.int(), formCompletions: z.int(), votes: z.int(), comments: z.int(), follows: z.int(),
  impressions: z.int(), clicks: z.int(), ctr: z.number(), mediaStarts: z.int(), media25: z.int(), media50: z.int(), media75: z.int(), mediaCompletions: z.int(), mediaErrors: z.int(),
});
export type CmsStatMetrics = z.infer<typeof cmsStatMetricsSchema>;
export const cmsStatScopeSchema = z.object({
  startTime: z.string(), endTime: z.string(), timeZone: z.string(), granularity: z.enum(CMS_STAT_GRANULARITIES),
  comparisonStart: z.string().nullable(), comparisonEnd: z.string().nullable(), watermark: z.string(),
});
export type CmsStatScope = z.infer<typeof cmsStatScopeSchema>;
export const cmsStatReportRowSchema = cmsStatMetricsSchema.extend({ key: z.string(), label: z.string() });
export type CmsStatReportRow = z.infer<typeof cmsStatReportRowSchema>;
export const cmsStatOverviewSchema = z.object({
  scope: cmsStatScopeSchema, status: z.enum(CMS_STAT_STATUSES), metrics: cmsStatMetricsSchema,
  previousMetrics: cmsStatMetricsSchema.nullable(),
  collectionAvailableSince: z.string().nullable(), comparisonAvailable: z.boolean(), comparisonUnavailableReason: z.string().nullable(),
  trend: z.array(z.object({ date: z.string(), pv: z.int(), uv: z.int(), sessions: z.int(), reads: z.int(), conversions: z.int(), searches: z.int() })),
});
export type CmsStatOverview = z.infer<typeof cmsStatOverviewSchema>;
export const cmsStatReportSchema = paginated(cmsStatReportRowSchema).extend({ scope: cmsStatScopeSchema, dimension: z.enum(CMS_STAT_DIMENSIONS) });
export type CmsStatReport = z.infer<typeof cmsStatReportSchema>;
export const cmsStatQualitySchema = z.object({
  scope: cmsStatScopeSchema, status: z.enum(CMS_STAT_STATUSES), configuredEnabled: z.boolean(), publishedEnabled: z.boolean(),
  acceptedEvents: z.int(), rejectedEvents: z.int(), duplicateEvents: z.int(), rejectionRate: z.number(), duplicateRate: z.number(),
  pendingConversions: z.int(), failedConversions: z.int(),
  lastReceivedAt: z.string().nullable(), lastEventAt: z.string().nullable(), latencyP95Ms: z.number().nullable(),
  eventsWithoutPage: z.int(), eventsWithoutVisitor: z.int(), eventTypes: z.array(z.object({ event: z.string(), count: z.int() })),
  reasons: z.array(z.object({ reason: z.string(), count: z.int() })),
});
export type CmsStatQuality = z.infer<typeof cmsStatQualitySchema>;
export const cmsStatFilterOptionSchema = z.object({ value: z.string(), label: z.string() });
export const cmsStatOptionsSchema = z.object({ content: z.array(cmsStatFilterOptionSchema), channel: z.array(cmsStatFilterOptionSchema), author: z.array(cmsStatFilterOptionSchema), release: z.array(cmsStatFilterOptionSchema) });
export type CmsStatOptions = z.infer<typeof cmsStatOptionsSchema>;

/** CMS 数据看板统计 */
export const cmsDashboardStatsSchema = z.object({
  totals: z.object({
    published: z.int(),
    draft: z.int(),
    pending: z.int(),
    offline: z.int(),
    rejected: z.int(),
    recycled: z.int(),
  }),
  pendingComments: z.int(),
  todayPublished: z.int(),
  totalViews: z.int(),
  publishTrend: z.array(z.object({ date: z.string(), count: z.int() })),
  topViewed: z.array(z.object({
    id: z.int(),
    title: z.string(),
    viewCount: z.int(),
    channelName: z.string().nullable(),
    publishedAt: z.string().nullable(),
    likeCount: z.int(),
    favoriteCount: z.int(),
    commentCount: z.int(),
  })),
  channelDistribution: z.array(z.object({
    channelId: z.int(),
    channelName: z.string(),
    count: z.int(),
  })),
  contentTypeDistribution: z.array(z.object({
    contentType: z.enum(CMS_CONTENT_TYPES),
    count: z.int(),
  })).meta({ description: '内容形态分布（图文 / 图集 / 音视频 / 链接）' }),
}).meta({ id: 'CmsDashboardStats' });

export type CmsDashboardStats = z.infer<typeof cmsDashboardStatsSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const cmsStatsQuery = z.object({
  siteId: requiredIdQuery(),
  watermark: z.iso.datetime().optional().meta({ description: '首次概览返回的采集快照上界，用于固定分页和导出', ...filterMeta({ kind: 'keyword', fields: '快照时间' }) }),
  days: z.coerce.number().int().min(1).max(90).default(30).meta({ description: '近 N 天（含今日）', ...filterMeta({ kind: 'keyword', fields: '统计天数' }) }),
  ...dateRangeQuery('统计日期（结束日期含当日）'),
  timeZone: z.string().max(64).refine(isCmsStatTimeZone, '请选择有效的 IANA 时区').default('Asia/Shanghai').meta({ description: '统计日界时区', ...filterMeta({ kind: 'keyword', fields: 'IANA 时区' }) }),
  granularity: queryEnum(CMS_STAT_GRANULARITIES, '时间粒度').default('day'),
  compare: queryEnum(CMS_STAT_COMPARISONS, '对比周期').default('previous_period'),
  contentId: idQuery(), channelId: idQuery(), releaseId: idQuery(), deploymentId: idQuery(),
  author: keywordQuery('作者', { description: '按作者名称精确筛选' }), contentType: queryEnum(CMS_CONTENT_TYPES, '内容形态'),
  source: keywordQuery('入口来源', { description: '按入口来源精确筛选' }), device: keywordQuery('设备类型', { description: '按设备类型精确筛选' }),
});
export const cmsStatReportQuery = cmsStatsQuery.extend({
  ...paginationQuery.shape,
  dimension: queryEnum(CMS_STAT_DIMENSIONS, '分组维度').default('content'),
  keyword: keywordQuery('分组名称'),
  sortBy: queryEnum(CMS_STAT_SORT_FIELDS, '排序指标').default('pv'),
  sortOrder: queryEnum(CMS_STAT_SORT_ORDERS, '排序方向').default('desc'),
});

export const cmsDashboardQuery = z.object({
  siteId: requiredIdQuery(),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const cmsStatContract = defineContract('/api/cms/stats', {
  visits: op.get('/visits', { access: { permission: 'cms:stat:view' }, query: cmsStatsQuery, response: cmsVisitStatsSchema, summary: '访问统计总览（今日/昨日卡片 + PV/UV 趋势 + 内容TOP + 来源/设备/通道分布）' }),
  search: op.get('/search', { access: { permission: 'cms:stat:view' }, query: cmsStatsQuery, response: cmsSearchAnalyticsSchema, summary: '搜索分析（搜索量趋势 + 热搜词榜 + 无结果词榜）' }),
  overview: op.get('/overview', { access: { permission: 'cms:stat:view' }, query: cmsStatsQuery, response: cmsStatOverviewSchema, summary: '统一事件事实的统计概览、对比与连续趋势' }),
  report: op.get('/report', { access: { permission: 'cms:stat:view' }, query: cmsStatReportQuery, response: cmsStatReportSchema, summary: '内容、渠道、搜索、媒体与版位分页统计' }),
  quality: op.get('/quality', { access: { permission: 'cms:stat:view' }, query: cmsStatsQuery, response: cmsStatQualitySchema, summary: '采集配置、数据延迟、拒收与去重诊断' }),
  options: op.get('/options', { access: { permission: 'cms:stat:view' }, query: cmsStatsQuery, response: cmsStatOptionsSchema, summary: '当前统计范围可筛选的内容、栏目、作者与发布名称' }),
}, { tags: ['CMS-访问统计'] });

export const cmsDashboardContract = defineContract('/api/cms/dashboard', {
  stats: op.get('/stats', { access: { permission: 'cms:dashboard:view' }, query: cmsDashboardQuery, response: cmsDashboardStatsSchema, summary: 'CMS 数据看板统计' }),
}, { tags: ['CMS-内容管理'] });
