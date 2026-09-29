import * as z from 'zod';
import { CMS_PAGE_PRESET_FIELDS, CMS_PAGE_PRESET_FIELD_VALUES } from './constants';
import { isValidCmsAssetUrl, isValidCmsLink } from './link';
import type { CmsPageBlock } from './contracts/pages';
import type { CmsPagePresetVersion } from './contracts/page-presets';

const parameterKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,49}$/, '参数标识仅允许字母开头的字母、数字、下划线')
  .refine(value => !['__proto__', 'prototype', 'constructor'].includes(value), '参数标识为保留字');
export const cmsPagePresetValuesSchema = z.record(parameterKey, z.union([z.string().max(2000), z.number().finite()]))
  .refine(value => Object.keys(value).length <= 50, '最多 50 个参数');
export const cmsPagePresetSourceSchema = z.strictObject({
  presetId: z.number().int().positive(),
  version: z.number().int().positive(),
  instanceId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  blockId: z.string().trim().min(1).max(100),
  values: cmsPagePresetValuesSchema,
});
export const cmsPagePresetParameterSchema = z.strictObject({
  key: parameterKey,
  label: z.string().trim().min(1).max(100),
  blockId: z.string().trim().min(1).max(100),
  field: z.enum(CMS_PAGE_PRESET_FIELD_VALUES),
});
export type CmsPagePresetParameter = z.infer<typeof cmsPagePresetParameterSchema>;

/** Fixed fields and unique targets make parameter substitution deterministic and prototype-safe. */
export function validateCmsPagePresetDefinition(blocks: readonly CmsPageBlock[], parameters: readonly CmsPagePresetParameter[]): void {
  if (!blocks.length || blocks.length > 50) throw new Error('组合须包含 1 至 50 个区块');
  if (parameters.length > 50) throw new Error('最多 50 个参数');
  const blockIds = new Set(blocks.map(block => block.id));
  if (blockIds.size !== blocks.length) throw new Error('组合区块标识不能重复');
  const keys = new Set<string>();
  const targets = new Set<string>();
  for (const raw of parameters) {
    const parameter = cmsPagePresetParameterSchema.parse(raw);
    const block = blocks.find(item => item.id === parameter.blockId);
    const field = CMS_PAGE_PRESET_FIELDS.find(item => item.value === parameter.field);
    if (!block || !field?.blockTypes.includes(block.type)) throw new Error(`参数「${parameter.label}」未指向可配置的区块字段`);
    const target = `${parameter.blockId}:${parameter.field}`;
    if (keys.has(parameter.key) || targets.has(target)) throw new Error('参数标识及目标字段不能重复');
    keys.add(parameter.key); targets.add(target);
  }
}

export function resolveCmsPagePresetValues(
  version: Pick<CmsPagePresetVersion, 'blocks' | 'parameters'>,
  overrides: Record<string, string | number>,
): Record<string, string | number> {
  validateCmsPagePresetDefinition(version.blocks, version.parameters);
  const parsed = cmsPagePresetValuesSchema.parse(overrides);
  const keys = new Set(version.parameters.map(parameter => parameter.key));
  if (Object.keys(parsed).some(key => !keys.has(key))) throw new Error('包含未声明的组合参数');
  return Object.fromEntries(version.parameters.map(parameter => {
    const block = version.blocks.find(item => item.id === parameter.blockId)!;
    const field = CMS_PAGE_PRESET_FIELDS.find(item => item.value === parameter.field)!;
    const fallback = block.props[parameter.field] ?? (field.kind === 'number' ? 5 : '');
    const value = Object.hasOwn(parsed, parameter.key) ? parsed[parameter.key] : fallback;
    if (field.kind === 'number') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) throw new Error(`参数「${parameter.label}」须为 1 至 20 的整数`);
    } else {
      if (typeof value !== 'string' || value.length > 2000) throw new Error(`参数「${parameter.label}」须为文本`);
      if (value && field.kind === 'image' && !isValidCmsAssetUrl(value)) throw new Error(`参数「${parameter.label}」须为有效的图片地址`);
      if (value && field.kind === 'link' && !isValidCmsLink(value)) throw new Error(`参数「${parameter.label}」须为有效的链接`);
      if (value && field.kind === 'channel' && !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`参数「${parameter.label}」须为有效的栏目编码`);
    }
    return [parameter.key, value as string | number];
  }));
}

/** Materialize an independent snapshot; later version edits never mutate the result. */
export function buildCmsPagePresetInstance(
  version: Pick<CmsPagePresetVersion, 'presetId' | 'version' | 'blocks' | 'parameters'>,
  overrides: Record<string, string | number>,
  instanceId: string,
): CmsPageBlock[] {
  const values = resolveCmsPagePresetValues(version, overrides);
  cmsPagePresetSourceSchema.parse({ presetId: version.presetId, version: version.version, instanceId, blockId: 'validate', values });
  return version.blocks.map((source, index) => {
    const block: CmsPageBlock = {
      id: `${instanceId}_${index + 1}`,
      type: source.type,
      props: structuredClone(source.props),
      ...(source.displayCondition ? { displayCondition: structuredClone(source.displayCondition) } : {}),
      presetSource: { presetId: version.presetId, version: version.version, instanceId, blockId: source.id, values: { ...values } },
    };
    for (const parameter of version.parameters) if (parameter.blockId === source.id) block.props[parameter.field] = values[parameter.key];
    return block;
  });
}

/** Source metadata remains valid after local props edits or removal of part of an instance. */
export function validateCmsPagePresetSources(
  blocks: readonly CmsPageBlock[],
  versions: readonly Pick<CmsPagePresetVersion, 'presetId' | 'siteId' | 'version' | 'blocks' | 'parameters'>[],
  siteId: number,
): void {
  const instances = new Map<string, { fingerprint: string; blockIds: Set<string> }>();
  for (const block of blocks) {
    if (!block.presetSource) continue;
    const source = cmsPagePresetSourceSchema.parse(block.presetSource);
    const version = versions.find(item => item.presetId === source.presetId && item.version === source.version && item.siteId === siteId);
    const original = version?.blocks.find(item => item.id === source.blockId);
    if (!version || !original || original.type !== block.type) throw new Error('区块组合来源不存在、类型不符或不属于本站');
    resolveCmsPagePresetValues(version, source.values);
    const fingerprint = JSON.stringify([source.presetId, source.version, Object.entries(source.values).sort(([a], [b]) => a.localeCompare(b))]);
    const instance = instances.get(source.instanceId);
    if (instance && (instance.fingerprint !== fingerprint || instance.blockIds.has(source.blockId))) throw new Error('同一组合实例的来源版本、参数或区块标识不一致');
    if (instance) instance.blockIds.add(source.blockId);
    else instances.set(source.instanceId, { fingerprint, blockIds: new Set([source.blockId]) });
  }
}
