import * as z from 'zod';
import { auditFieldsSchema, idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createReportCategorySchema, reportLookupQuerySchema, updateReportCategorySchema } from '../validation';
import { reportLookupOptionSchema } from './_common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 仪表盘分类 */
export const reportDashboardCategorySchema = z.object({
  id: z.int(),
  name: z.string(),
  sort: z.int(),
  dashboardCount: z.int().optional(),
  remark: z.string().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ReportDashboardCategory' });

export type ReportDashboardCategory = z.infer<typeof reportDashboardCategorySchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const reportCategoryContract = defineContract('/api/report/categories', {
  list: op.get('/', { access: { permission: 'report:dashboard:list' }, response: z.array(reportDashboardCategorySchema), summary: '分类列表' }),
  lookup: op.get('/lookup', { access: { permission: 'report:dashboard:list' }, query: reportLookupQuerySchema.omit({ status: true }), response: z.array(reportLookupOptionSchema), summary: '分类轻量下拉' }),
  create: op.post('/', { access: { permission: 'report:dashboard:update' }, audit: '创建报表分类', body: createReportCategorySchema, response: reportDashboardCategorySchema, summary: '创建分类' }),
  update: op.put('/{id}', { access: { permission: 'report:dashboard:update' }, audit: '更新报表分类', params: idParam, body: updateReportCategorySchema, response: reportDashboardCategorySchema, summary: '更新分类' }),
  remove: op.delete('/{id}', { access: { permission: 'report:dashboard:update' }, audit: '删除报表分类', params: idParam, summary: '删除分类' }),
}, { auditModule: '报表分类', tags: ['报表分类'] });
