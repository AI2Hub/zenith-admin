import * as z from 'zod';
import { entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery, requiredIdQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import {
  createCmsFriendLinkGroupSchema,
  createCmsFriendLinkSchema,
  updateCmsFriendLinkGroupSchema,
  updateCmsFriendLinkSchema,
} from '../validation';
import { cmsSiteScopeQuery } from './tags';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 友链分组（独立实体：支持排序与稳定 code，供主题按组取数） */
export const cmsFriendLinkGroupSchema = z.object({
  id: z.int(),
  siteId: z.int(),
  name: z.string().meta({ example: '技术栈' }),
  code: z.string().meta({ example: 'tech', description: '分组标识（站内唯一），主题按组取数的稳定引用' }),
  status: entityStatusSchema,
  sort: z.int(),
  remark: z.string().nullable(),
  linkCount: z.int().optional().meta({ description: '组内友链数（分页列表返回）' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'CmsFriendLinkGroup' });

export type CmsFriendLinkGroup = z.infer<typeof cmsFriendLinkGroupSchema>;

export const cmsFriendLinkSchema = z.object({
  id: z.int(),
  siteId: z.int(),
  groupId: z.int().nullable().meta({ description: '所属分组；空 = 未分组' }),
  groupName: z.string().nullable().optional(),
  name: z.string().meta({ example: '合作伙伴' }),
  url: z.string(),
  logo: z.string().nullable(),
  status: entityStatusSchema,
  sort: z.int(),
  remark: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'CmsFriendLink' });

export type CmsFriendLink = z.infer<typeof cmsFriendLinkSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const cmsFriendLinkListQuery = paginationQuery.extend({
  siteId: requiredIdQuery(),
  keyword: keywordQuery(),
  status: entityStatusQuery,
  groupId: z.coerce.number().int().min(0).optional().meta({ description: '0 = 仅未分组' }),
});

export const cmsFriendLinkGroupListQuery = paginationQuery.extend({
  siteId: requiredIdQuery(),
  keyword: keywordQuery(),
  status: entityStatusQuery,
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const cmsFriendLinkContract = defineContract('/api/cms/friend-links', {
  groupAll: op.get('/groups/all', { access: { permission: 'cms:link:list' }, query: cmsSiteScopeQuery, response: z.array(cmsFriendLinkGroupSchema), summary: '站点全部启用分组（下拉用）' }),
  groupList: op.get('/groups', { access: { permission: 'cms:link:list' }, query: cmsFriendLinkGroupListQuery, response: paginated(cmsFriendLinkGroupSchema), summary: '友链分组分页列表' }),
  groupCreate: op.post('/groups', { access: { permission: 'cms:link:create' }, audit: '创建 CMS 友链分组', body: createCmsFriendLinkGroupSchema, response: cmsFriendLinkGroupSchema, summary: '创建友链分组' }),
  groupUpdate: op.put('/groups/{id}', { access: { permission: 'cms:link:update' }, audit: '更新 CMS 友链分组', params: idParam, body: updateCmsFriendLinkGroupSchema, response: cmsFriendLinkGroupSchema, summary: '更新友链分组' }),
  groupRemove: op.delete('/groups/{id}', { access: { permission: 'cms:link:delete' }, audit: '删除 CMS 友链分组', params: idParam, summary: '删除友链分组（组内友链转为未分组）' }),
  list: op.get('/', { access: { permission: 'cms:link:list' }, query: cmsFriendLinkListQuery, response: paginated(cmsFriendLinkSchema), summary: '友链分页列表' }),
  create: op.post('/', { access: { permission: 'cms:link:create' }, audit: '创建 CMS 友情链接', body: createCmsFriendLinkSchema, response: cmsFriendLinkSchema, summary: '创建友链' }),
  update: op.put('/{id}', { access: { permission: 'cms:link:update' }, audit: '更新 CMS 友情链接', params: idParam, body: updateCmsFriendLinkSchema, response: cmsFriendLinkSchema, summary: '更新友链' }),
  remove: op.delete('/{id}', { access: { permission: 'cms:link:delete' }, audit: '删除 CMS 友情链接', params: idParam, summary: '删除友链' }),
}, { auditModule: 'CMS内容管理', tags: ['CMS-友情链接'] });

