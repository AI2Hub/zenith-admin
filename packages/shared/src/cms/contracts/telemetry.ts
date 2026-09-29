import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { idParam, paginationQuery, paginated, queryEnum } from '../../core';
import { CMS_TELEMETRY_ATTRIBUTION_STATUSES, CMS_TELEMETRY_DELIVERY_STATUSES } from '../constants';
import { cmsTelemetryBatchSchema, cmsTelemetryResultSchema, cmsTelemetrySettingsSchema } from '../telemetry';

export const publicCmsTelemetryContract = defineContract('/api/public/cms', {
  collect: op.post('/telemetry', { public: true, body: cmsTelemetryBatchSchema, response: cmsTelemetryResultSchema, summary: '采集已发布 CMS 页面行为（固定上下文、幂等事件）' }),
}, { tags: ['CMS-前台公开接口'] });
export const cmsTelemetryDeliverySchema = z.object({
  id: z.int(), siteId: z.int(), eventId: z.uuid(), name: z.string(), targetName: z.string().nullable(),
  occurredAt: z.string(), createdAt: z.string(), deliveredAt: z.string().nullable(),
  status: z.enum(CMS_TELEMETRY_DELIVERY_STATUSES), attempts: z.int(), replayCount: z.int(),
  lastError: z.string().nullable(), nextAttemptAt: z.string().nullable(), lastAttemptAt: z.string().nullable(),
  contextAvailable: z.boolean(), attributionStatus: z.enum(CMS_TELEMETRY_ATTRIBUTION_STATUSES).nullable(),
  attributionComputedAt: z.string().nullable(), attributionSettledAt: z.string().nullable(),
  originContentTitle: z.string().nullable(),
}).meta({ id: 'CmsTelemetryDelivery' });
export type CmsTelemetryDelivery = z.infer<typeof cmsTelemetryDeliverySchema>;
export const cmsTelemetryDeliverySummarySchema = z.object({ pending: z.int(), retrying: z.int(), processing: z.int(), failed: z.int(),
  oldestPendingAt: z.string().nullable(), oldestPendingAgeSeconds: z.int(), missingContext: z.int(), pendingAttribution: z.int() });
export const cmsTelemetryAdminContract = defineContract('/api/cms/telemetry', {
  deliveries: op.get('/{id}/deliveries', { access: { permission: 'cms:stat:view' }, params: idParam,
    query: paginationQuery.extend({ status: queryEnum(CMS_TELEMETRY_DELIVERY_STATUSES) }), response: paginated(cmsTelemetryDeliverySchema), summary: '站点转化投递及归因明细（不返回访客凭证）' }),
  deliverySummary: op.get('/{id}/deliveries/summary', { access: { permission: 'cms:stat:view' }, params: idParam,
    response: cmsTelemetryDeliverySummarySchema, summary: '站点当前投递积压和缺失上下文' }),
  replay: op.post('/{id}/deliveries/{deliveryId}/replay', { access: { permission: 'cms:site:update' }, audit: '重放 CMS 转化投递或重算归因',
    params: idParam.extend({ deliveryId: z.coerce.number().int().positive() }),
    response: z.object({ queued: z.literal(true), eventId: z.uuid(), mode: z.enum(['delivery', 'attribution']) }), summary: '按原事件 ID 重新排队；已成功事件仅重算归因' }),
  configure: op.put('/{id}', { access: { permission: 'cms:site:update' }, audit: '更新 CMS 采集设置', params: idParam, body: cmsTelemetrySettingsSchema,
    response: cmsTelemetrySettingsSchema.extend({ siteId: z.int(), requiresPublication: z.literal(true) }), summary: '配置站点统一行为采集与统计时区' }),
}, { tags: ['CMS-访问统计'], auditModule: 'CMS内容管理' });
