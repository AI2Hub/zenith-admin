import * as z from 'zod';
import { auditFieldsSchema, idParam, requiredIdQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { copyCmsPagePresetSchema, createCmsPagePresetSchema, instantiateCmsPagePresetSchema, saveCmsPagePresetVersionSchema } from '../validation';
import { cmsPagePresetParameterSchema } from '../page-presets';
import { cmsPageBlockViewSchema } from './pages';

export const cmsPagePresetSchema = z.object({
  id: z.int(), siteId: z.int(), name: z.string(), description: z.string().nullable(),
  currentVersion: z.int(), blockCount: z.int(),
  ...auditFieldsSchema,
  createdAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'CmsPagePreset' });
export type CmsPagePreset = z.infer<typeof cmsPagePresetSchema>;
export const cmsPagePresetVersionSummarySchema = z.object({
  id: z.int(), presetId: z.int(), siteId: z.int(), version: z.int(), name: z.string(),
  description: z.string().nullable(), note: z.string().nullable(), createdAt: z.string(),
}).meta({ id: 'CmsPagePresetVersionSummary' });
export type CmsPagePresetVersionSummary = z.infer<typeof cmsPagePresetVersionSummarySchema>;
export const cmsPagePresetVersionSchema = cmsPagePresetVersionSummarySchema.extend({
  blocks: z.array(cmsPageBlockViewSchema), parameters: z.array(cmsPagePresetParameterSchema),
}).meta({ id: 'CmsPagePresetVersion' });
export type CmsPagePresetVersion = z.infer<typeof cmsPagePresetVersionSchema>;
export const cmsPagePresetUsageSchema = z.object({
  pageId: z.int(), pageName: z.string(), pageSlug: z.string(), instanceId: z.string(),
  sourceVersion: z.int(), latestVersion: z.int(), blockIds: z.array(z.string()), canUpgrade: z.boolean(),
}).meta({ id: 'CmsPagePresetUsage' });
export type CmsPagePresetUsage = z.infer<typeof cmsPagePresetUsageSchema>;

export const cmsPagePresetContract = defineContract('/api/cms/page-presets', {
  list: op.get('/', { access: { permission: 'cms:page:list' }, query: z.object({ siteId: requiredIdQuery() }), response: z.array(cmsPagePresetSchema), summary: '站点页面组合库' }),
  detail: op.get('/{id}', { access: { permission: 'cms:page:list' }, params: idParam, response: cmsPagePresetVersionSchema, summary: '页面组合最新版本' }),
  create: op.post('/', { access: { permission: 'cms:page:update' }, audit: '保存 CMS 页面区块组合', body: createCmsPagePresetSchema, response: cmsPagePresetSchema, summary: '保存区块组合快照' }),
  versions: op.get('/{id}/versions', { access: { permission: 'cms:page:list' }, params: idParam, response: z.array(cmsPagePresetVersionSummarySchema), summary: '组合版本记录' }),
  version: op.get('/{id}/versions/{version}', { access: { permission: 'cms:page:list' }, params: idParam.extend({ version: z.coerce.number().int().positive() }), response: cmsPagePresetVersionSchema, summary: '组合指定版本' }),
  saveVersion: op.post('/{id}/versions', { access: { permission: 'cms:page:update' }, audit: '保存 CMS 页面组合新版本', params: idParam, body: saveCmsPagePresetVersionSchema, response: cmsPagePresetSchema, summary: '按预期版本追加组合版本' }),
  copy: op.post('/{id}/copy', { access: { permission: 'cms:page:update' }, audit: '复制 CMS 页面组合', params: idParam, body: copyCmsPagePresetSchema, response: cmsPagePresetSchema, summary: '复制本站组合' }),
  usages: op.get('/{id}/usages', { access: { permission: 'cms:page:list' }, params: idParam, response: z.array(cmsPagePresetUsageSchema), summary: '使用页面、来源版本与更新影响' }),
  instantiate: op.post('/{id}/instantiate', { access: { permission: 'cms:page:list' }, params: idParam, body: instantiateCmsPagePresetSchema, response: z.object({ blocks: z.array(cmsPageBlockViewSchema) }), summary: '按固定参数生成独立区块快照' }),
}, { auditModule: 'CMS内容管理', tags: ['CMS-页面组合'] });
