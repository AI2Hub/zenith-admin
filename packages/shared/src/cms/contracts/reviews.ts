import * as z from 'zod';
import { defineContract, op, idParam, paginationQuery, paginated, requiredIdQuery, keywordQuery } from '../../core';
import { asyncTaskSchema } from '../../tasks/contracts/async-tasks';
import { CMS_CONTENT_REVIEW_ISSUE_KINDS } from '../constants';
import { completeCmsContentReviewSchema, saveCmsContentReviewPolicySchema, scanCmsContentReviewsSchema } from '../reviews-validation';

export const cmsContentReviewIssueSchema = z.object({
  key: z.string(), kind: z.enum(CMS_CONTENT_REVIEW_ISSUE_KINDS), summary: z.string(), target: z.string().nullable(), taskId: z.int().nullable(),
});
export type CmsContentReviewIssue = z.infer<typeof cmsContentReviewIssueSchema>;
export const cmsContentReviewPolicySchema = z.object({
  contentId: z.int(), siteId: z.int(), contentTitle: z.string(), version: z.int(), enabled: z.boolean(), ownerId: z.int().nullable(), ownerName: z.string().nullable(),
  intervalDays: z.int(), nextReviewAt: z.string().nullable(), validUntil: z.string().nullable(), noticeDays: z.int(), checkLinks: z.boolean(), checkAssetRights: z.boolean(),
  activeRevisionId: z.int().nullable(), lastReviewedAt: z.string().nullable(), lastReviewedRevisionId: z.int().nullable(), lastCheckedAt: z.string().nullable(), lastCheckTaskId: z.int().nullable(),
  issues: z.array(cmsContentReviewIssueSchema),
}).meta({ id: 'CmsContentReviewPolicy' });
export type CmsContentReviewPolicy = z.infer<typeof cmsContentReviewPolicySchema>;
export const cmsContentReviewRecordSchema = z.object({ id: z.int(), contentId: z.int(), revisionId: z.int(), generationId: z.int(), note: z.string(), actorName: z.string(), nextReviewAt: z.string(), createdAt: z.string() }).meta({ id: 'CmsContentReviewRecord' });
export type CmsContentReviewRecord = z.infer<typeof cmsContentReviewRecordSchema>;
export const cmsContentReviewContract = defineContract('/api/cms/content-reviews', {
  list: op.get('/', { access: { permission: 'cms:content:list' }, query: paginationQuery.extend({ siteId: requiredIdQuery(), keyword: keywordQuery('稿件标题') }), response: paginated(cmsContentReviewPolicySchema), summary: '已配置的内容复核策略' }),
  detail: op.get('/{id}', { access: { permission: 'cms:content:list' }, params: idParam, response: cmsContentReviewPolicySchema, summary: '内容复核策略与最近巡检结果' }),
  save: op.put('/{id}', { access: { permission: 'cms:editorial-task:manage' }, params: idParam, body: saveCmsContentReviewPolicySchema, response: cmsContentReviewPolicySchema, audit: '配置内容定期复核', summary: '按版本保存负责人、周期及有效期' }),
  records: op.get('/{id}/records', { access: { permission: 'cms:content:list' }, params: idParam, response: z.array(cmsContentReviewRecordSchema), summary: '内容人工复核历史' }),
  complete: op.post('/{id}/complete', { access: { permission: 'cms:editorial-task:manage' }, params: idParam, body: completeCmsContentReviewSchema, response: cmsContentReviewPolicySchema, audit: '完成内容定期复核', summary: '确认当前在线修订并安排下次复核' }),
  scan: op.post('/scan', { access: { permission: 'cms:editorial-task:manage' }, body: scanCmsContentReviewsSchema, response: asyncTaskSchema, audit: '提交内容复核巡检', summary: '后台检查在线内容和素材风险并形成编辑事项' }),
}, { auditModule: 'CMS内容管理', tags: ['CMS-内容复核'] });
