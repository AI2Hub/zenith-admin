import * as z from 'zod';
import { auditFieldsSchema, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryBool } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { asyncTaskSchema } from '../../tasks/contracts/async-tasks';
import { createReportSubscriptionSchema, reportBatchEnabledSchema, updateReportSubscriptionSchema } from '../validation';
import { reportDeliveryStatusSchema, reportMisfirePolicyEnum, reportNotifyChannelEnum } from './_common';

// ─── 订阅推送 ───────────────────────────────────────────────────────────────

export const reportDashboardSubscriptionSchema = z.object({
  id: z.int(),
  dashboardId: z.int(),
  dashboardName: z.string().nullable().optional(),
  cron: z.string(),
  timezone: z.string(),
  misfirePolicy: reportMisfirePolicyEnum,
  channels: z.array(reportNotifyChannelEnum),
  recipients: z.string().nullable().optional().meta({ description: '收件人邮箱（逗号分隔）；inApp 推给创建者' }),
  webhookUrl: z.string().nullable().optional(),
  enabled: z.boolean(),
  remark: z.string().nullable().optional(),
  lastRunAt: z.string().nullable().optional(),
  nextRunAt: z.string().nullable().optional(),
  lastDeliveryAt: z.string().nullable().optional(),
  lastDeliveryStatus: reportDeliveryStatusSchema.nullable().optional(),
  lastDeliveryError: z.string().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ReportDashboardSubscription' });

export type ReportDashboardSubscription = z.infer<typeof reportDashboardSubscriptionSchema>;

export const reportSubscriptionListQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  dashboardId: idQuery(),
  enabled: queryBool(),
});

export const reportSubscriptionContract = defineContract('/api/report/subscriptions', {
  list: op.get('/', { access: { permission: 'report:subscription:list' }, query: reportSubscriptionListQuery, response: paginated(reportDashboardSubscriptionSchema), summary: '订阅列表' }),
  batchStatus: op.put('/batch-status', { access: { permission: 'report:subscription:update' }, audit: '批量更新报表订阅状态', body: reportBatchEnabledSchema, summary: '批量启停订阅' }),
  create: op.post('/', { access: { permission: 'report:subscription:create' }, audit: '创建报表订阅', body: createReportSubscriptionSchema, response: reportDashboardSubscriptionSchema, summary: '创建订阅' }),
  update: op.put('/{id}', { access: { permission: 'report:subscription:update' }, audit: '更新报表订阅', params: idParam, body: updateReportSubscriptionSchema, response: reportDashboardSubscriptionSchema, summary: '更新订阅' }),
  remove: op.delete('/{id}', { access: { permission: 'report:subscription:delete' }, audit: '删除报表订阅', params: idParam, summary: '删除订阅' }),
  run: op.post('/{id}/run', { access: { permission: 'report:subscription:update' }, audit: '手动推送报表订阅', params: idParam, response: asyncTaskSchema, summary: '立即推送' }),
}, { auditModule: '报表订阅', tags: ['报表订阅'] });
