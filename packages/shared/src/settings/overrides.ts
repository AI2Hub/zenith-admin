import * as z from 'zod';
import { isPlainObject, stableStringify } from '../core/json';
import { stripDefaultsDeep } from '../core/validation';
import { SETTINGS_MODULES, type SettingsModuleKey } from './registry';
import type { SettingsDoc } from './resolve';

/** JSONB 回读会改变对象键顺序，内容指纹与无变化判断必须使用稳定序列化。 */
export function stableSettingsSerialize(value: unknown): string {
  return stableStringify(value) ?? 'undefined';
}

const overridesSchemas = new Map<SettingsModuleKey, z.ZodType<SettingsDoc>>();

/**
 * 覆盖层只允许已声明字段；对象递归稀疏，数组整体替换。
 * 对象级跨字段校验留到与上级合并后执行，叶子的类型与范围校验仍由原 schema 派生。
 */
export function settingsOverridesSchema(module: SettingsModuleKey): z.ZodType<SettingsDoc> {
  const cached = overridesSchemas.get(module);
  if (cached) return cached;
  const sparse = (schema: z.ZodType): z.ZodType => {
    if (!(schema instanceof z.ZodObject)) return schema;
    const shape: Record<string, z.ZodType> = {};
    for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      const { id: _id, ...metadata } = field.meta() ?? {};
      shape[key] = sparse(field).optional().meta(metadata);
    }
    const { id: _id, ...metadata } = schema.meta() ?? {};
    return z.strictObject(shape).meta(metadata);
  };
  const schema = sparse(stripDefaultsDeep(SETTINGS_MODULES[module].schema, { strictObjects: true })) as z.ZodType<SettingsDoc>;
  overridesSchemas.set(module, schema);
  return schema;
}

/** 校验后移除空分组；显式等于上级的叶子仍然保留，绝不根据值推断继承。 */
export function parseSettingsOverrides(module: SettingsModuleKey, input: unknown): SettingsDoc {
  const prune = (doc: SettingsDoc): SettingsDoc => {
    const result: SettingsDoc = {};
    for (const [key, value] of Object.entries(doc)) {
      if (value === undefined) continue;
      if (isPlainObject(value)) {
        const nested = prune(value);
        if (Object.keys(nested).length > 0) result[key] = nested;
      } else {
        result[key] = structuredClone(value);
      }
    }
    return result;
  };
  return prune(settingsOverridesSchema(module).parse(input));
}

function segmentsOf(path: string): string[] {
  const segments = path.split('.');
  if (segments.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new Error(`非法设置字段路径：${path}`);
  }
  return segments;
}

/** 设置一个显式覆盖，不修改传入的草稿或复用调用者可变的数组 / 对象引用。 */
export function setSettingsOverride(overrides: SettingsDoc, path: string, value: unknown): SettingsDoc {
  if (value === undefined) return removeSettingsOverride(overrides, path);
  const segments = segmentsOf(path);
  const write = (doc: SettingsDoc, index: number): SettingsDoc => {
    const key = segments[index];
    if (index === segments.length - 1) return { ...doc, [key]: structuredClone(value) };
    return { ...doc, [key]: write(isPlainObject(doc[key]) ? doc[key] : {}, index + 1) };
  };
  return write(overrides, 0);
}

/** 恢复字段 / 分组继承，同时移除空祖先分组。 */
export function removeSettingsOverride(overrides: SettingsDoc, path: string): SettingsDoc {
  const segments = segmentsOf(path);
  const remove = (doc: SettingsDoc, index: number): SettingsDoc => {
    const next = { ...doc };
    const key = segments[index];
    if (index === segments.length - 1) delete next[key];
    else if (isPlainObject(next[key])) {
      const child = remove(next[key], index + 1);
      if (Object.keys(child).length === 0) delete next[key];
      else next[key] = child;
    }
    return next;
  };
  return remove(overrides, 0);
}
