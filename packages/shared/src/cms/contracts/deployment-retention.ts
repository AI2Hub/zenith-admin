import * as z from 'zod';
import { defineContract, op, idParam, paginationQuery, paginated, requiredIdQuery } from '../../core';
import { asyncTaskSchema } from '../../tasks/contracts/async-tasks';
import { CMS_DEPLOYMENT_STORAGE_STATES } from '../constants';
import { CMS_DEPLOYMENT_STATUSES, CMS_RELEASE_STATUSES } from '../release-validation';
import { cleanupCmsDeploymentsSchema, pinCmsDeploymentSchema, saveCmsDeploymentRetentionSchema } from '../deployment-retention';

export const cmsDeploymentRetentionPolicySchema = z.object({ siteId: z.int(), version: z.int(), retainCount: z.int(), retainDays: z.int(), failedRetainDays: z.int(), automatic: z.boolean() }).meta({ id: 'CmsDeploymentRetentionPolicy' });
export type CmsDeploymentRetentionPolicy = z.infer<typeof cmsDeploymentRetentionPolicySchema>;
export const cmsDeploymentCapacityRowSchema = z.object({
  id: z.int(), siteId: z.int(), releaseId: z.int(), releaseName: z.string(), releaseStatus: z.enum(CMS_RELEASE_STATUSES), status: z.enum(CMS_DEPLOYMENT_STATUSES),
  storageState: z.enum(CMS_DEPLOYMENT_STORAGE_STATES), version: z.int(), pinned: z.boolean(), pinReason: z.string().nullable(),
  schemaBytes: z.number().nullable(), fileBytes: z.number().nullable(), fileCount: z.int().nullable(), measuredAt: z.string().nullable(),
  schemaPurgedAt: z.string().nullable(), filesPurgedAt: z.string().nullable(), purgedAt: z.string().nullable(), cleanupTaskId: z.int().nullable(), error: z.string().nullable(),
  createdAt: z.string(), activatedAt: z.string().nullable(), protectedReasons: z.array(z.string()), eligible: z.boolean(),
}).meta({ id: 'CmsDeploymentCapacity' });
export type CmsDeploymentCapacityRow = z.infer<typeof cmsDeploymentCapacityRowSchema>;
export const cmsDeploymentCapacitySummarySchema = z.object({ retained: z.int(), purged: z.int(), protected: z.int(), eligible: z.int(), schemaBytes: z.number(), fileBytes: z.number(), unmeasured: z.int(), policy: cmsDeploymentRetentionPolicySchema }).meta({ id: 'CmsDeploymentCapacitySummary' });
export const cmsDeploymentCleanupPreviewSchema = z.object({ fingerprint: z.string(), candidates: z.array(cmsDeploymentCapacityRowSchema), totalCandidates: z.int(), bytes: z.number(), unmeasured: z.int(), protectedCount: z.int() }).meta({ id: 'CmsDeploymentCleanupPreview' });
export const cmsDeploymentRetentionContract = defineContract('/api/cms/deployment-retention', {
  list: op.get('/', { access: { permission: 'cms:publish:view' }, query: paginationQuery.extend({ siteId: requiredIdQuery() }), response: paginated(cmsDeploymentCapacityRowSchema), summary: '部署容量及保留保护原因' }),
  summary: op.get('/sites/{id}', { access: { permission: 'cms:publish:view' }, params: idParam, response: cmsDeploymentCapacitySummarySchema, summary: '站点部署容量与保留策略' }),
  savePolicy: op.put('/sites/{id}', { access: { permission: 'cms:publish:manage' }, params: idParam, body: saveCmsDeploymentRetentionSchema, response: cmsDeploymentRetentionPolicySchema, audit: '设置部署存储保留策略', summary: '按版本配置份数、时间和失败部署保留期' }),
  pin: op.put('/deployments/{id}/pin', { access: { permission: 'cms:publish:manage' }, params: idParam, body: pinCmsDeploymentSchema, response: cmsDeploymentCapacityRowSchema, audit: '设置部署重要版本标记', summary: '保留重要版本或解除标记' }),
  measure: op.post('/sites/{id}/measure', { access: { permission: 'cms:publish:manage' }, params: idParam, response: asyncTaskSchema, audit: '刷新部署存储占用', summary: '后台测量数据库与静态文件占用' }),
  preview: op.get('/sites/{id}/preview', { access: { permission: 'cms:publish:manage' }, params: idParam, response: cmsDeploymentCleanupPreviewSchema, summary: '预览最多一千个符合策略的可回收部署' }),
  cleanup: op.post('/sites/{id}/cleanup', { access: { permission: 'cms:publish:manage' }, params: idParam, body: cleanupCmsDeploymentsSchema, response: asyncTaskSchema, audit: '回收历史部署存储', summary: '固定预览对象并提交可恢复的存储回收任务' }),
}, { auditModule: 'CMS内容管理', tags: ['CMS-部署容量'] });
