import * as z from 'zod';
import { entityStatusQuery, entityStatusSchema, idParam, keywordQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { lazyRecursive } from '../../core/validation';
import type { EntityStatus } from '../../core/types';
import { REGION_LEVELS } from '../constants';
import type { RegionLevel } from '../constants';
import { createRegionSchema, updateRegionSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 行政区划；树形接口按 parentCode 递归挂 children，平铺 / 详情接口不含 children */
export interface Region {
  id: number;
  code: string;
  name: string;
  level: RegionLevel;
  parentCode: string | null;
  sort: number;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  children?: Region[];
}

/** 区划节点字段（不含子树）；服务端行投影用它，树接口在此基础上递归挂 children */
export const regionFieldsSchema = z.object({
  id: z.int(),
  code: z.string().meta({ example: '110000' }),
  name: z.string().meta({ example: '北京市' }),
  level: z.enum(REGION_LEVELS),
  parentCode: z.string().nullable(),
  sort: z.int(),
  status: entityStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const regionSchema: z.ZodType<Region> = lazyRecursive(() => regionFieldsSchema.extend({
  children: z.array(regionSchema).optional(),
})).meta({ id: 'Region' });

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const regionTreeQuery = z.object({
  keyword: keywordQuery('名称 / 区划代码'),
  status: entityStatusQuery,
  level: queryEnum(REGION_LEVELS),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const regionContract = defineContract('/api/regions', {
  tree: op.get('/', { access: { permission: 'system:region:list' }, query: regionTreeQuery, response: z.array(regionSchema), summary: '地区树形结构' }),
  flat: op.get('/flat', { access: { permission: 'system:region:list' }, response: z.array(regionSchema), summary: '平铺地区列表' }),
  detail: op.get('/{id}', { access: { permission: 'system:region:list' }, params: idParam, response: regionSchema, summary: '地区详情' }),
  create: op.post('/', { access: { permission: 'system:region:create', platformOnly: 'multi-tenant' }, audit: '创建地区', body: createRegionSchema, response: regionSchema, summary: '新增地区' }),
  update: op.put('/{id}', { access: { permission: 'system:region:update', platformOnly: 'multi-tenant' }, audit: '更新地区', params: idParam, body: updateRegionSchema, response: regionSchema, summary: '更新地区' }),
  remove: op.delete('/{id}', { access: { permission: 'system:region:delete', platformOnly: 'multi-tenant' }, audit: '删除地区', params: idParam, summary: '删除地区' }),
}, { auditModule: '地区管理', tags: ['Regions'] });
