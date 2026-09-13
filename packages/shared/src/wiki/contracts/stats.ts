import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { wikiUserRefSchema } from './docs';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const wikiStatsOverviewSchema = z.object({
  spaceCount: z.int(),
  docCount: z.int(),
  publishedCount: z.int(),
  pendingCount: z.int(),
  commentCount: z.int(),
  weekNewDocs: z.int(),
  weekViews: z.int(),
}).meta({ id: 'WikiStatsOverview' });

export type WikiStatsOverview = z.infer<typeof wikiStatsOverviewSchema>;

export const wikiHotDocSchema = z.object({
  id: z.int(),
  title: z.string(),
  spaceName: z.string(),
  viewCount: z.int(),
}).meta({ id: 'WikiHotDoc' });

export type WikiHotDoc = z.infer<typeof wikiHotDocSchema>;

export const wikiContributorSchema = z.object({
  ...wikiUserRefSchema.shape,
  docCount: z.int(),
}).meta({ id: 'WikiContributor' });

export type WikiContributor = z.infer<typeof wikiContributorSchema>;

/** 长期未更新的沉睡文档 */
export const wikiStaleDocSchema = z.object({
  id: z.int(),
  title: z.string(),
  spaceName: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'WikiStaleDoc' });

export type WikiStaleDoc = z.infer<typeof wikiStaleDocSchema>;

/** 运营统计扩展 */
export const wikiOpsStatsSchema = z.object({
  createdTrend: z.array(z.object({ date: z.string(), count: z.int() })).meta({ description: '近 30 天新建文档趋势' }),
  spaceDistribution: z.array(z.object({ spaceName: z.string(), count: z.int() })).meta({ description: '空间文档分布' }),
  searchCount30d: z.int(),
  noResultCount30d: z.int(),
  approvedCount30d: z.int(),
  rejectedCount30d: z.int(),
  pendingBacklog: z.int(),
  expiredCount: z.int(),
  reviewDueCount: z.int(),
  noOwnerCount: z.int(),
  archivedCount: z.int(),
}).meta({ id: 'WikiOpsStats' });

export type WikiOpsStats = z.infer<typeof wikiOpsStatsSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const wikiStatsLimitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10).meta({ description: 'Top N 条数', example: 10 }),
});

export const wikiStatsContract = defineContract('/api/wiki/stats', {
  overview: op.get('/overview', { access: { permission: 'wiki:stats:view' }, response: wikiStatsOverviewSchema, summary: '知识库概览统计' }),
  hotDocs: op.get('/hot-docs', { access: { permission: 'wiki:stats:view' }, query: wikiStatsLimitQuery, response: z.array(wikiHotDocSchema), summary: '热门文档 Top N' }),
  contributors: op.get('/contributors', { access: { permission: 'wiki:stats:view' }, query: wikiStatsLimitQuery, response: z.array(wikiContributorSchema), summary: '贡献榜 Top N' }),
  staleDocs: op.get('/stale-docs', { access: { permission: 'wiki:stats:view' }, query: wikiStatsLimitQuery, response: z.array(wikiStaleDocSchema), summary: '沉睡文档（长期未更新）' }),
  ops: op.get('/ops', { access: { permission: 'wiki:stats:view' }, response: wikiOpsStatsSchema, summary: '运营统计（趋势/分布/搜索/审批/治理计数）' }),
}, { tags: ['知识中心-统计'] });
