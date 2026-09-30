import * as z from 'zod';
import { partialForUpdate } from '../core/validation';
import { CMS_CONTENT_TYPES } from './constants';
import type { CmsFieldDefinition } from './model-design';
export const CMS_COLLECTION_SORTS = ['publishedAt', 'title', 'field'] as const;
export const cmsCollectionDefinitionSchema = z.object({
  modelVersionId: z.int().positive().nullable().default(null),
  modelId: z.int().positive().nullable().default(null), channelIds: z.array(z.int().positive()).max(100).default([]),
  tagIds: z.array(z.int().positive()).max(100).default([]), locale: z.string().max(35).nullable().default(null),
  contentType: z.enum(CMS_CONTENT_TYPES).nullable().default(null),
  filters: z.array(z.object({ field: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50), op: z.enum(['eq', 'gte', 'lte']), value: z.union([z.string().max(1000), z.number(), z.boolean()]) })).max(20).default([]),
  pinnedIds: z.array(z.int().positive()).max(100).default([]), excludedIds: z.array(z.int().positive()).max(100).default([]),
  sort: z.enum(CMS_COLLECTION_SORTS).default('publishedAt'), sortField: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50).nullable().default(null),
  direction: z.enum(['asc', 'desc']).default('desc'), limit: z.int().min(1).max(100).default(12),
}).superRefine((value, ctx) => {
  if ((value.filters.length || value.sort === 'field') && !value.modelId) ctx.addIssue({ code: 'custom', path: ['modelId'], message: '字段筛选和排序需要指定内容模型' });
  if (value.sort === 'field' && !value.sortField) ctx.addIssue({ code: 'custom', path: ['sortField'], message: '请选择排序字段' });
  if (new Set(value.pinnedIds).size !== value.pinnedIds.length || new Set(value.excludedIds).size !== value.excludedIds.length) ctx.addIssue({ code: 'custom', message: '固定或排除内容不能重复' });
  if (value.pinnedIds.some(id => value.excludedIds.includes(id))) ctx.addIssue({ code: 'custom', message: '同一内容不能同时固定和排除' });
});
export type CmsCollectionDefinition = z.output<typeof cmsCollectionDefinitionSchema>;
export const createCmsCollectionSchema = z.object({ siteId: z.int().positive(), name: z.string().trim().min(1).max(100), code: z.string().regex(/^[a-z][a-z0-9-]*$/).max(80), description: z.string().max(1000).nullable().optional(), definition: cmsCollectionDefinitionSchema });
export const updateCmsCollectionSchema = partialForUpdate(createCmsCollectionSchema).omit({ siteId: true }).extend({ expectedVersion: z.int().positive() });
export type CreateCmsCollectionInput = z.input<typeof createCmsCollectionSchema>;

export const CMS_COLLECTION_COMPARABLE_FIELD_TYPES = ['text', 'number', 'date', 'datetime', 'select', 'radio', 'switch'] as const;
type CollectionField = Pick<CmsFieldDefinition, 'name' | 'fieldType'>;
export type CmsCollectionCandidate = {
  id: number; title: string; modelId: number | null; channelId: number; tagIds: readonly number[];
  locale: string; contentType: string; publishedAt: Date | string | null; extend: Record<string, unknown>;
};

/** Validate against the published model; a numeric model field never accepts a textual filter value. */
export function validateCmsCollectionFieldRules(definition: CmsCollectionDefinition, fields: readonly CollectionField[]): string[] {
  const issues: string[] = [];
  const comparable = (name: string) => {
    const field = fields.find(item => item.name === name);
    if (!field || !(CMS_COLLECTION_COMPARABLE_FIELD_TYPES as readonly string[]).includes(field.fieldType)) {
      issues.push(`集合字段「${name}」必须是已发布模型中的可比较字段`); return undefined;
    }
    return field;
  };
  for (const rule of definition.filters) {
    const field = comparable(rule.field); if (!field) continue;
    const expected = field.fieldType === 'number' ? 'number' : field.fieldType === 'switch' ? 'boolean' : 'string';
    if (typeof rule.value !== expected || (typeof rule.value === 'number' && !Number.isFinite(rule.value))) issues.push(`集合字段「${rule.field}」筛选值类型必须为 ${expected}`);
    if (field.fieldType === 'switch' && rule.op !== 'eq') issues.push(`开关字段「${rule.field}」只支持等于筛选`);
  }
  if (definition.sort === 'field' && definition.sortField) comparable(definition.sortField);
  return issues;
}

function comparableValue(value: unknown, fieldType: string): string | number | boolean | undefined {
  if (fieldType === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (fieldType === 'switch') return typeof value === 'boolean' ? value : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** Callers keep missing values last in either direction; ordinary values use the schema's scalar type. */
export function compareCmsCollectionValues(left: unknown, right: unknown, fieldType: string): number {
  const a = comparableValue(left, fieldType); const b = comparableValue(right, fieldType);
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a) < String(b) ? -1 : 1;
}

/** Only pass eligible published rows: authorization, site, expiry and channel visibility remain caller-owned. */
export function selectCmsCollectionCandidates<T extends CmsCollectionCandidate>(
  eligibleRows: readonly T[], definition: CmsCollectionDefinition, fields: readonly CollectionField[], limit = definition.limit,
): T[] {
  const excluded = new Set(definition.excludedIds);
  const rows = [...new Map(eligibleRows.filter(row => !excluded.has(row.id)).map(row => [row.id, row])).values()];
  const pinned = new Set(definition.pinnedIds);
  const matches = (row: T) => (!definition.modelId || row.modelId === definition.modelId)
    && (!definition.channelIds.length || definition.channelIds.includes(row.channelId))
    && (!definition.locale || definition.locale === row.locale)
    && (!definition.contentType || definition.contentType === row.contentType)
    && definition.tagIds.every(id => row.tagIds.includes(id))
    && definition.filters.every(rule => {
      const field = fields.find(item => item.name === rule.field);
      if (!field || comparableValue(row.extend[rule.field], field.fieldType) === undefined || comparableValue(rule.value, field.fieldType) === undefined) return false;
      const compared = compareCmsCollectionValues(row.extend[rule.field], rule.value, field.fieldType);
      return rule.op === 'eq' ? compared === 0 : rule.op === 'gte' ? compared >= 0 : compared <= 0;
    });
  const sortType = definition.sort === 'field' ? fields.find(field => field.name === definition.sortField)?.fieldType ?? 'text' : definition.sort === 'publishedAt' ? 'number' : 'text';
  const value = (row: T) => definition.sort === 'title' ? row.title : definition.sort === 'field' ? row.extend[definition.sortField ?? ''] : row.publishedAt == null ? undefined : row.publishedAt instanceof Date ? row.publishedAt.getTime() : Date.parse(row.publishedAt);
  const ordered = rows.filter(row => !pinned.has(row.id) && matches(row)).sort((a, b) => {
    const av = comparableValue(value(a), sortType); const bv = comparableValue(value(b), sortType);
    if (av === undefined && bv !== undefined) return 1;
    if (bv === undefined && av !== undefined) return -1;
    const compared = compareCmsCollectionValues(av, bv, sortType);
    return (definition.direction === 'asc' ? compared : -compared) || b.id - a.id;
  });
  return [...definition.pinnedIds.flatMap(id => rows.filter(row => row.id === id)), ...ordered].slice(0, Math.max(0, Math.min(definition.limit, limit)));
}
