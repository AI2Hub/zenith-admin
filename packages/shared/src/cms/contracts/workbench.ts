import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { idQuery, queryEnum, requiredIdQuery } from '../../core/api-schemas';
import { ASYNC_TASK_STATUSES } from '../../tasks/constants';
import { CMS_PREVIEW_MODES, CMS_RELEASE_CHANGE_KINDS, CMS_PREVIEW_EDIT_TARGET_KINDS, CMS_CONFIGURATION_OBJECT_KINDS, CMS_CONFIGURATION_STATES, CMS_RELEASE_CHECK_KINDS, CMS_RELEASE_CHECK_OBJECT_KINDS, CMS_RELEASE_CHECK_ACTIONS } from '../constants';
import { CMS_RELEASE_STATUSES } from '../release-validation';
import { renderCmsWorkbenchPreviewSchema } from '../workbench-validation';

export const cmsPreviewEditTargetSchema = z.object({
  key: z.string(), kind: z.enum(CMS_PREVIEW_EDIT_TARGET_KINDS), id: z.int().positive(), siteId: z.int().positive(),
  blockId: z.string().nullable(), label: z.string(), href: z.string(),
});
export type CmsPreviewEditTarget = z.infer<typeof cmsPreviewEditTargetSchema>;
export const cmsWorkbenchPreviewSchema = z.object({
  html: z.string(), status: z.int(), path: z.string(), mode: z.enum(CMS_PREVIEW_MODES),
  sourceLabel: z.string(), fingerprint: z.string(), generationId: z.int().nullable(),
  contentVersions: z.array(z.object({ id: z.int(), version: z.int() })),
  editTargets: z.array(cmsPreviewEditTargetSchema),
}).meta({ id: 'CmsWorkbenchPreview' });
export type CmsWorkbenchPreview = z.infer<typeof cmsWorkbenchPreviewSchema>;
export const cmsReleaseFieldDiffSchema = z.object({ path: z.string(), before: z.unknown(), after: z.unknown() });
export const cmsReleaseChangeSchema = z.object({
  kind: z.enum(CMS_RELEASE_CHANGE_KINDS), id: z.int(), title: z.string(), operation: z.enum(['create', 'update', 'remove']),
  fields: z.array(cmsReleaseFieldDiffSchema), editPath: z.string(), paths: z.array(z.string()),
});
export type CmsReleaseChange = z.infer<typeof cmsReleaseChangeSchema>;
export const cmsReleaseCheckObjectSchema = z.object({ kind: z.enum(CMS_RELEASE_CHECK_OBJECT_KINDS), id: z.int(), title: z.string(), revisionId: z.int().nullable() });
export const cmsReleaseCheckSchema = z.object({
  kind: z.enum(CMS_RELEASE_CHECK_KINDS), severity: z.enum(['error', 'warning']), code: z.string(), message: z.string(),
  object: cmsReleaseCheckObjectSchema,
  reference: z.object({ kind: z.enum(CMS_RELEASE_CHECK_OBJECT_KINDS), id: z.int() }).nullable(),
  fieldPath: z.string().nullable(), fieldLabel: z.string().nullable(), nodeId: z.string().nullable(),
  editTarget: z.object({ href: z.string(), label: z.string() }).nullable(), recommendedAction: z.enum(CMS_RELEASE_CHECK_ACTIONS),
});
export type CmsReleaseCheck = z.infer<typeof cmsReleaseCheckSchema>;
export const cmsReleaseDependencyOptionSchema = z.object({ contentId: z.int(), revisionId: z.int(), revisionVersion: z.int(), title: z.string(), hash: z.string() });
export type CmsReleaseDependencyOption = z.infer<typeof cmsReleaseDependencyOptionSchema>;
export const cmsReleaseTaskSummarySchema = z.object({
  id: z.int(), taskType: z.string(), title: z.string(), status: z.enum(ASYNC_TASK_STATUSES),
  totalCount: z.int().nullable(), processedCount: z.int(), progressNote: z.string().nullable(), errorMessage: z.string().nullable(),
});
export const cmsReleaseReviewSchema = z.object({
  releaseId: z.int(), fingerprint: z.string(), baseGenerationId: z.int().nullable(), currentGenerationId: z.int().nullable(),
  comparisonGenerationId: z.int().nullable(), stale: z.boolean(),
  validation: z.object({ inputFingerprint: z.string(), ruleVersion: z.string(), checkedAt: z.string() }),
  dependencyOptions: z.array(cmsReleaseDependencyOptionSchema),
  changes: z.array(cmsReleaseChangeSchema), checks: z.array(cmsReleaseCheckSchema),
  affectedPaths: z.array(z.string()), wholeSiteAffected: z.boolean(), tasks: z.array(cmsReleaseTaskSummarySchema),
}).meta({ id: 'CmsReleaseReview' });
export type CmsReleaseReview = z.infer<typeof cmsReleaseReviewSchema>;

export const cmsConfigurationStateQuery = z.object({ siteId: requiredIdQuery(), kind: queryEnum(CMS_CONFIGURATION_OBJECT_KINDS, '配置对象').default('site'), objectId: idQuery() }).superRefine((query, ctx) => {
  if (query.kind !== 'site' && !query.objectId) ctx.addIssue({ code: 'custom', path: ['objectId'], message: '请选择已保存的页面或部件' });
  if (query.kind === 'site' && query.objectId && query.objectId !== query.siteId) ctx.addIssue({ code: 'custom', path: ['objectId'], message: '站点对象必须与当前站点一致' });
});
export const cmsConfigurationStateSchema = z.object({
  siteId: z.int(), kind: z.enum(CMS_CONFIGURATION_OBJECT_KINDS), objectId: z.int(), state: z.enum(CMS_CONFIGURATION_STATES),
  generationId: z.int().nullable(), hasPublished: z.boolean(), savedAt: z.string().nullable(),
  release: z.object({ id: z.int(), name: z.string(), status: z.enum(CMS_RELEASE_STATUSES), href: z.string(), matchesSaved: z.boolean() }).nullable(),
}).meta({ id: 'CmsConfigurationState' });
export type CmsConfigurationState = z.infer<typeof cmsConfigurationStateSchema>;

export const cmsWorkbenchContract = defineContract('/api/cms/workbench', {
  configurationState: op.get('/configuration-state', { access: { permission: ['cms:page:list', 'cms:widget:list', 'cms:site:list'] }, query: cmsConfigurationStateQuery, response: cmsConfigurationStateSchema, summary: '当前已保存配置与实际线上快照的状态及授权发布入口' }),
  preview: op.post('/preview', { access: { permission: ['cms:content:list', 'cms:page:list', 'cms:widget:list', 'cms:site:list', 'cms:publish:view'] },
    audit: { description: '预览 CMS 工作区', recordResponseBody: false }, body: renderCmsWorkbenchPreviewSchema, response: cmsWorkbenchPreviewSchema, summary: '受权预览工作稿、候选或线上版本，不产生公开副作用' }),
  configurationDraft: op.get('/configuration-draft', { access: { permission: ['cms:content:list', 'cms:page:list', 'cms:widget:list', 'cms:site:list', 'cms:publish:view'] },
    query: z.object({ siteId: requiredIdQuery() }), response: z.object({ id: z.int(), name: z.string(), href: z.string() }).nullable(), summary: '当前操作者待发布配置草稿入口' }),
}, { tags: ['CMS-工作区'], auditModule: 'CMS内容管理' });
