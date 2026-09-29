import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { idParam, idQuery, paginationQuery, paginated, requiredIdQuery } from '../../core/api-schemas';
import { CMS_DELIVERY_CAUSES, CMS_DELIVERY_OBSERVATION_STATUSES, CMS_DELIVERY_PURGE_STATUSES, CMS_DELIVERY_STATUSES } from '../constants';
import { cmsDeliveryConfigValuesSchema, saveCmsDeliveryConfigSchema, startCmsDeliverySchema } from '../delivery-validation';

export const cmsDeliveryConfigSchema = cmsDeliveryConfigValuesSchema.extend({ siteId: z.int(), version: z.int(), effectiveSourceBaseUrl: z.string().nullable() }).meta({ id: 'CmsDeliveryConfig' });
export type CmsDeliveryConfig = z.infer<typeof cmsDeliveryConfigSchema>;
export const cmsDeliveryObservationSchema = z.object({
  target: z.enum(['source', 'public']), path: z.string(), url: z.string().nullable(), status: z.enum(CMS_DELIVERY_OBSERVATION_STATUSES),
  httpStatus: z.int().nullable(), generationId: z.int().nullable(), releaseId: z.int().nullable(), visibilityEpoch: z.int().nullable(),
  cacheStatus: z.string().nullable(), age: z.string().nullable(), message: z.string(), checkedAt: z.string(),
}).meta({ id: 'CmsDeliveryObservation' });
export type CmsDeliveryObservation = z.infer<typeof cmsDeliveryObservationSchema>;
export const cmsDeliveryPathExpectationSchema = z.object({ path: z.string(), expectedStatus: z.enum(['visible', 'withdrawn']), kind: z.enum(['page', 'asset']).optional(), assetUrl: z.string().nullable().optional() });
export type CmsDeliveryPathExpectation = z.infer<typeof cmsDeliveryPathExpectationSchema>;
export const cmsDeliveryRunSchema = z.object({
  id: z.int(), siteId: z.int(), releaseId: z.int().nullable(), generationId: z.int().nullable(), activationId: z.int().nullable(), visibilityEpoch: z.int(),
  cause: z.enum(CMS_DELIVERY_CAUSES), status: z.enum(CMS_DELIVERY_STATUSES), taskId: z.int().nullable(), configVersion: z.int(),
  sourceBaseUrl: z.string().nullable(), publicBaseUrl: z.string().nullable(), sourceHost: z.string().nullable(),
  purgeStatus: z.enum(CMS_DELIVERY_PURGE_STATUSES), purgeHttpStatus: z.int().nullable(), purgeMessage: z.string().nullable(),
  paths: z.array(cmsDeliveryPathExpectationSchema), observations: z.array(cmsDeliveryObservationSchema),
  error: z.string().nullable(), startedAt: z.string().nullable(), completedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'CmsDeliveryRun' });
export type CmsDeliveryRun = z.infer<typeof cmsDeliveryRunSchema>;
export const cmsDeliveryRunSummarySchema = cmsDeliveryRunSchema.omit({ paths: true, observations: true });
export type CmsDeliveryRunSummary = z.infer<typeof cmsDeliveryRunSummarySchema>;
export const cmsDeliveryContract = defineContract('/api/cms/delivery', {
  config: op.get('/config', { access: { permission: 'cms:publish:view' }, query: z.object({ siteId: requiredIdQuery() }), response: cmsDeliveryConfigSchema, summary: '交付验证入口与关键路径' }),
  saveConfig: op.put('/config', { access: { permission: 'cms:publish:manage' }, audit: '设置 CMS 交付验证入口', query: z.object({ siteId: requiredIdQuery() }), body: saveCmsDeliveryConfigSchema, response: cmsDeliveryConfigSchema, summary: '设置源站和公开入口' }),
  list: op.get('/', { access: { permission: 'cms:publish:view' }, query: paginationQuery.extend({ siteId: requiredIdQuery(), releaseId: idQuery('发布单') }), response: paginated(cmsDeliveryRunSummarySchema), summary: '交付验证记录' }),
  detail: op.get('/{id}', { access: { permission: 'cms:publish:view' }, params: idParam, response: cmsDeliveryRunSchema, summary: '刷新与逐路径验证证据' }),
  start: op.post('/', { access: { permission: 'cms:publish:manage' }, audit: '重新验证 CMS 当前公开版本', body: startCmsDeliverySchema, response: cmsDeliveryRunSchema, summary: '按当前激活身份验证交付' }),
  retry: op.post('/{id}/retry', { access: { permission: 'cms:publish:manage' }, audit: '重试 CMS 交付验证', params: idParam, response: cmsDeliveryRunSchema, summary: '仅允许对当前激活身份重试' }),
}, { auditModule: 'CMS内容管理', tags: ['CMS-交付验证'] });
