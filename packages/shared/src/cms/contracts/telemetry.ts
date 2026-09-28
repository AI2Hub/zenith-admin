import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { idParam } from '../../core';
import { cmsTelemetryBatchSchema, cmsTelemetryResultSchema, cmsTelemetrySettingsSchema } from '../telemetry';

export const publicCmsTelemetryContract = defineContract('/api/public/cms', {
  collect: op.post('/telemetry', { public: true, body: cmsTelemetryBatchSchema, response: cmsTelemetryResultSchema, summary: '采集已发布 CMS 页面行为（固定上下文、幂等事件）' }),
}, { tags: ['CMS-前台公开接口'] });
export const cmsTelemetryAdminContract = defineContract('/api/cms/telemetry', {
  configure: op.put('/{id}', { access: { permission: 'cms:site:update' }, audit: '更新 CMS 采集设置', params: idParam, body: cmsTelemetrySettingsSchema,
    response: cmsTelemetrySettingsSchema.extend({ siteId: z.int(), requiresPublication: z.literal(true) }), summary: '配置站点统一行为采集与统计时区' }),
}, { tags: ['CMS-访问统计'] });
