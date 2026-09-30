import * as z from 'zod';
import { auditFieldsSchema, idParam, requiredIdQuery, paginationQuery, paginated, keywordQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { cmsCollectionDefinitionSchema, createCmsCollectionSchema, updateCmsCollectionSchema } from '../content-collections';
export const cmsContentCollectionSchema = z.object({ id: z.int(), siteId: z.int(), name: z.string(), code: z.string(), description: z.string().nullable(), definition: cmsCollectionDefinitionSchema, version: z.int(), ...auditFieldsSchema, createdAt: z.string(), updatedAt: z.string() }).meta({ id: 'CmsContentCollection' });
export type CmsContentCollection = z.infer<typeof cmsContentCollectionSchema>;
export const cmsCollectionResultSchema = z.object({ version: z.int(), items: z.array(z.object({ id: z.int(), title: z.string(), reason: z.string(), canonicalUrl: z.string().nullable() })) }).meta({ id: 'CmsCollectionResult' });
export const cmsContentCollectionContract = defineContract('/api/cms/content-collections', {
  list: op.get('/', { access: { permission: 'cms:collection:list' }, query: paginationQuery.extend({ siteId: requiredIdQuery(), keyword: keywordQuery('集合名称 / 编码') }), response: paginated(cmsContentCollectionSchema), summary: '内容集合列表' }),
  all: op.get('/all', { access: { permission: ['cms:collection:list', 'cms:page:update', 'cms:site:update'] }, query: z.object({ siteId: requiredIdQuery() }), response: z.array(cmsContentCollectionSchema), summary: '可用于编排的内容集合' }),
  detail: op.get('/{id}', { access: { permission: 'cms:collection:list' }, params: idParam, response: cmsContentCollectionSchema, summary: '集合工作配置' }),
  create: op.post('/', { access: { permission: 'cms:collection:manage' }, body: createCmsCollectionSchema, response: cmsContentCollectionSchema, audit: '创建内容集合', summary: '创建并留存集合定义版本' }),
  update: op.put('/{id}', { access: { permission: 'cms:collection:manage' }, params: idParam, body: updateCmsCollectionSchema, response: cmsContentCollectionSchema, audit: '修改内容集合', summary: '保存新集合版本并准备配置发布草稿' }),
  remove: op.delete('/{id}', { access: { permission: 'cms:collection:manage' }, params: idParam, audit: '删除内容集合', summary: '删除未被编排引用的集合' }),
  preview: op.get('/{id}/preview', { access: { permission: ['cms:collection:list', 'cms:content:list'] }, params: idParam, response: cmsCollectionResultSchema, summary: '按已发布内容预览当前集合规则和命中原因' }),
  versions: op.get('/{id}/versions', { access: { permission: 'cms:collection:list' }, params: idParam, response: z.array(z.object({ version: z.int(), name: z.string(), definition: cmsCollectionDefinitionSchema, createdAt: z.string() })), summary: '集合定义版本历史' }),
}, { tags: ['CMS-内容集合'], auditModule: 'CMS内容管理' });
