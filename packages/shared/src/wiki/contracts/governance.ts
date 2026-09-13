import * as z from 'zod';
import { paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { WIKI_DOC_STATUSES, WIKI_GOVERNANCE_KINDS } from '../constants';
import {
  importWikiDocsSchema,
  wikiGovernanceArchiveSchema,
  wikiGovernanceBatchSchema,
  wikiGovernanceOwnerSchema,
  wikiGovernanceReviewSchema,
} from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 治理清单行（列表专用投影，非完整文档） */
export const wikiGovernanceDocSchema = z.object({
  id: z.int(),
  spaceId: z.int(),
  spaceName: z.string(),
  title: z.string(),
  status: z.enum(WIKI_DOC_STATUSES),
  ownerId: z.int().nullable(),
  ownerName: z.string().nullable(),
  expireAt: z.string().nullable(),
  reviewCycleDays: z.int().nullable(),
  nextReviewAt: z.string().nullable(),
  isArchived: z.boolean(),
  updatedAt: z.string(),
}).meta({ id: 'WikiGovernanceDoc' });

export type WikiGovernanceDoc = z.infer<typeof wikiGovernanceDocSchema>;

/** 无结果搜索关键词（知识缺口） */
export const wikiNoResultKeywordSchema = z.object({
  keyword: z.string(),
  searchCount: z.int(),
  lastSearchedAt: z.string(),
}).meta({ id: 'WikiNoResultKeyword' });

export type WikiNoResultKeyword = z.infer<typeof wikiNoResultKeywordSchema>;

export const wikiImportResultSchema = z.object({
  importedCount: z.int(),
  docIds: z.array(z.int()),
}).meta({ id: 'WikiImportResult' });

export type WikiImportResult = z.infer<typeof wikiImportResultSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const wikiGovernanceDocListQuery = paginationQuery.extend({
  kind: queryEnum(WIKI_GOVERNANCE_KINDS, '治理清单类型').default('all').meta({ example: 'all' }),
});

export const wikiGovernanceContract = defineContract('/api/wiki/governance', {
  listDocs: op.get('/docs', {
    access: { permission: 'wiki:governance:list' },
    query: wikiGovernanceDocListQuery,
    response: paginated(wikiGovernanceDocSchema),
    summary: '治理清单（全部/过期/待复审/长期未更新/无负责人/积压/已归档）',
  }),
  noResultKeywords: op.get('/no-result-keywords', { access: { permission: 'wiki:governance:list' }, response: z.array(wikiNoResultKeywordSchema), summary: '无结果搜索关键词（近 30 天知识缺口）' }),
  remind: op.post('/remind', { access: { permission: 'wiki:governance:remind' }, audit: '提醒文档负责人', body: wikiGovernanceBatchSchema, summary: '批量提醒负责人' }),
  archive: op.post('/archive', { access: { permission: 'wiki:governance:archive' }, audit: '归档文档', body: wikiGovernanceArchiveSchema, summary: '批量归档 / 取消归档' }),
  setOwner: op.post('/owner', { access: { permission: 'wiki:governance:edit' }, audit: '指定文档负责人', body: wikiGovernanceOwnerSchema, summary: '批量指定负责人' }),
  setReviewCycle: op.post('/review-cycle', { access: { permission: 'wiki:governance:edit' }, audit: '设置文档复审周期', body: wikiGovernanceReviewSchema, summary: '批量设置复审周期与有效期' }),
  importDocs: op.post('/import', { access: { permission: 'wiki:doc:create' }, audit: '批量导入文档', body: importWikiDocsSchema, response: wikiImportResultSchema, summary: '批量导入 Markdown 文件为草稿' }),
}, { auditModule: '知识中心', tags: ['知识中心-治理'] });
