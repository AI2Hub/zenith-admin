import * as z from 'zod';
import { entityStatusQuery, entityStatusSchema, idParam, requiredIdQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { CMS_CHANNEL_DETAIL_PATH_RULES, CMS_CHANNEL_STATIC_MODES, CMS_CHANNEL_TYPES } from '../constants';
import {
  batchCreateCmsChannelsSchema,
  createCmsChannelSchema,
  mergeCmsChannelsSchema,
  setCmsAuthorizedUsersSchema,
  updateCmsChannelSchema,
} from '../validation';
import { cmsAuthorizedUsersSchema } from './sites';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 栏目节点字段（不含子树）；栏目树在此基础上递归挂 children */
export const cmsChannelFieldsSchema = z.object({
  id: z.int(),
  siteId: z.int(),
  parentId: z.int().meta({ example: 0 }),
  modelId: z.int().nullable(),
  modelName: z.string().nullable().optional(),
  name: z.string().meta({ example: '新闻中心' }),
  code: z.string().meta({ example: 'news', description: '栏目标识（站内唯一）：模板 / 区块 / 内链 / 开放 API 的稳定引用' }),
  slug: z.string().meta({ example: 'news' }),
  path: z.string().meta({ example: 'news' }),
  type: z.enum(CMS_CHANNEL_TYPES),
  linkUrl: z.string().nullable(),
  listTemplate: z.string().nullable(),
  detailTemplate: z.string().nullable(),
  staticMode: z.enum(CMS_CHANNEL_STATIC_MODES).meta({ description: '栏目静态化模式（inherit = 跟随站点）' }),
  detailPathRule: z.enum(CMS_CHANNEL_DETAIL_PATH_RULES).meta({ description: '详情页静态产物目录归档策略（内容 staticPath 优先）' }),
  pageSize: z.int(),
  pageContent: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoKeywords: z.string().nullable(),
  seoDescription: z.string().nullable(),
  image: z.string().nullable(),
  visible: z.boolean(),
  status: entityStatusSchema,
  sort: z.int(),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 递归类型需要显式命名，声明文件才能保留 children 的元素类型 */
export interface CmsChannel extends z.infer<typeof cmsChannelFieldsSchema> {
  children?: CmsChannel[];
}

export const cmsChannelSchema: z.ZodType<CmsChannel> = cmsChannelFieldsSchema
  .extend({
    get children() {
      return z.array(cmsChannelSchema).optional();
    },
  })
  .meta({ id: 'CmsChannel' });

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const cmsChannelTreeQuery = z.object({
  siteId: requiredIdQuery(),
  status: entityStatusQuery,
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const cmsChannelContract = defineContract('/api/cms/channels', {
  tree: op.get('/tree', { access: { permission: 'cms:channel:list' }, query: cmsChannelTreeQuery, response: z.array(cmsChannelSchema), summary: '站点栏目树' }),
  detail: op.get('/{id}', { access: { permission: 'cms:channel:list' }, params: idParam, response: cmsChannelSchema, summary: '栏目详情' }),
  create: op.post('/', { access: { permission: 'cms:channel:create' }, audit: '创建 CMS 栏目', body: createCmsChannelSchema, response: cmsChannelSchema, summary: '创建栏目' }),
  update: op.put('/{id}', { access: { permission: 'cms:channel:update' }, audit: '更新 CMS 栏目', params: idParam, body: updateCmsChannelSchema, response: cmsChannelSchema, summary: '更新栏目' }),
  remove: op.delete('/{id}', { access: { permission: 'cms:channel:delete' }, audit: '删除 CMS 栏目', params: idParam, summary: '删除栏目' }),
  merge: op.post('/merge', { access: { permission: 'cms:channel:update' }, audit: 'CMS 栏目合并', body: mergeCmsChannelsSchema, summary: '栏目合并（来源栏目内容并入目标栏目后删除来源栏目）' }),
  clear: op.post('/{id}/clear', { access: { permission: 'cms:channel:update' }, audit: 'CMS 栏目清空', params: idParam, summary: '清空栏目（栏目下内容全部移入回收站）' }),
  batchCreate: op.post('/batch-create', { access: { permission: 'cms:channel:create' }, audit: 'CMS 栏目批量新增', body: batchCreateCmsChannelsSchema, summary: '批量新增栏目（行支持「名称|slug」；slug 默认首字母缩写，路径冲突自动加序号）' }),
  users: op.get('/{id}/users', { access: { permission: 'cms:channel:list' }, params: idParam, response: cmsAuthorizedUsersSchema, summary: '栏目授权用户' }),
  setUsers: op.put('/{id}/users', { access: { permission: 'cms:channel:update' }, audit: '设置 CMS 栏目授权用户', params: idParam, body: setCmsAuthorizedUsersSchema, summary: '设置栏目授权用户（绑定后仅授权用户可管理该栏目下内容）' }),
}, { auditModule: 'CMS内容管理', tags: ['CMS-栏目管理'] });

