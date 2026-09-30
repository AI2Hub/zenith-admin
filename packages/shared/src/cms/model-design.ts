import * as z from 'zod';
import { isPlainObject, stableStringify } from '../core/json';
import { lazyRecursive } from '../core/validation';
import { CMS_FIELD_OPTION_SOURCES, CMS_FIELD_TYPES, CMS_MODEL_MAX_DEPTH, CMS_MODEL_MAX_FIELDS } from './constants';

const optionSchema = z.object({ label: z.string().min(1).max(200), value: z.string().max(200) });
const nestedFieldBaseSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50), label: z.string().min(1).max(100),
  fieldType: z.enum(CMS_FIELD_TYPES), required: z.boolean().optional(), searchable: z.boolean().optional(),
  defaultValue: z.unknown().optional(), placeholder: z.string().max(200).nullable().optional(),
  optionSource: z.enum(CMS_FIELD_OPTION_SOURCES).optional(), dictCode: z.string().max(64).nullable().optional(),
  options: z.array(optionSchema).max(500).nullable().optional(), resolvedOptions: z.array(optionSchema).max(500).optional(),
});
const configurationBaseSchema = z.object({
  min: z.number().optional(), max: z.number().optional(),
  minLength: z.int().min(0).optional(), maxLength: z.int().min(1).max(2_000_000).optional(),
  unique: z.boolean().optional(), referenceModelIds: z.array(z.int().positive()).max(50).optional(),
  requiredWhen: z.object({ field: z.string().min(1), equals: z.union([z.string(), z.number(), z.boolean()]) }).optional(),
  componentVersionId: z.int().positive().optional(),
});
export type CmsNestedFieldDefinition = z.infer<typeof nestedFieldBaseSchema> & { configuration?: CmsFieldConfiguration | null };
export type CmsBlockTypeDefinition = { id?: string; code: string; label: string; componentVersionId?: number; fields: CmsNestedFieldDefinition[] };
export type CmsFieldConfiguration = z.infer<typeof configurationBaseSchema> & { fields?: CmsNestedFieldDefinition[]; blockTypes?: CmsBlockTypeDefinition[] };
export const cmsNestedFieldDefinitionSchema: z.ZodType<CmsNestedFieldDefinition, CmsNestedFieldDefinition> = lazyRecursive(() => nestedFieldBaseSchema.extend({
  configuration: cmsFieldConfigurationSchema.nullable().optional(),
}).strict()).meta({ id: 'CmsNestedFieldDefinition' });
export const cmsFieldConfigurationSchema: z.ZodType<CmsFieldConfiguration, CmsFieldConfiguration> = lazyRecursive(() => configurationBaseSchema.extend({
  fields: z.array(cmsNestedFieldDefinitionSchema).max(CMS_MODEL_MAX_FIELDS).optional(),
  blockTypes: z.array(z.object({ id: z.string().min(1).max(100).optional(), code: z.string().regex(/^[a-z][a-z0-9_-]*$/).max(50), label: z.string().min(1).max(100), componentVersionId: z.int().positive().optional(), fields: z.array(cmsNestedFieldDefinitionSchema).max(CMS_MODEL_MAX_FIELDS) }).strict()).max(30).optional(),
}).strict()).meta({ id: 'CmsFieldConfiguration' });

export const cmsQualityIssueSchema = z.object({ rule: z.string(), severity: z.enum(['error', 'warning']), fieldPath: z.string(), message: z.string() });
export type CmsQualityIssue = z.infer<typeof cmsQualityIssueSchema>;
export type CmsFieldDefinition = Omit<CmsNestedFieldDefinition, 'id'> & { id?: string | number };

/** Entire-tree checks also run after reusable components have been expanded. */
export function validateCmsFieldDefinitions(fields: readonly CmsFieldDefinition[]): CmsQualityIssue[] {
  const issues: CmsQualityIssue[] = [];
  let count = 0;
  const issue = (fieldPath: string, message: string) => issues.push({ rule: 'model_definition', severity: 'error', fieldPath, message });
  const visit = (items: readonly CmsFieldDefinition[], prefix: string, depth: number) => {
    if (depth > CMS_MODEL_MAX_DEPTH) { issue(prefix, `字段嵌套最多 ${CMS_MODEL_MAX_DEPTH} 层`); return; }
    const names = new Set<string>(); const ids = new Set<string>();
    for (const field of items) {
      if (++count > CMS_MODEL_MAX_FIELDS) { issue(prefix, `模型字段总数最多 ${CMS_MODEL_MAX_FIELDS} 个`); return; }
      const path = prefix ? `${prefix}.${field.name}` : field.name;
      if (names.has(field.name)) issue(path, '同级字段标识重复');
      names.add(field.name);
      if (typeof field.id === 'string') { if (ids.has(field.id)) issue(path, '字段稳定 ID 重复'); ids.add(field.id); }
      const config = field.configuration;
      if (config?.componentVersionId && !['object', 'array'].includes(field.fieldType)) issue(path, '组件版本仅可绑定字段组或重复组件');
      if (config?.fields && !['object', 'array'].includes(field.fieldType)) issue(path, '仅字段组或重复组件可定义子字段');
      if (config?.blockTypes && field.fieldType !== 'blocks') issue(path, '仅区块字段可定义区块类型');
      if (config?.min != null && config.max != null && config.min > config.max) issue(path, '最小值不能大于最大值');
      if (config?.minLength != null && config.maxLength != null && config.minLength > config.maxLength) issue(path, '最小长度不能大于最大长度');
      if (field.optionSource === 'dict' && !field.dictCode?.trim()) issue(path, '字典来源必须提供字典编码');
      const optionValues = (field.resolvedOptions ?? field.options ?? []).map(option => option.value);
      if (new Set(optionValues).size !== optionValues.length) issue(path, '选项值不能重复');
      if (config?.requiredWhen && !items.some((item) => item.name === config.requiredWhen!.field)) issue(path, '条件必填必须引用同级已定义字段');
      if (config?.requiredWhen?.field === field.name) issue(path, '条件必填不能引用自身');
      if (config?.fields) visit(config.fields, path, depth + 1);
      const codes = new Set<string>();
      for (const block of config?.blockTypes ?? []) {
        if (codes.has(block.code)) issue(`${path}.${block.code}`, '区块标识重复');
        codes.add(block.code); visit(block.fields, `${path}[${block.code}]`, depth + 1);
      }
    }
  };
  visit(fields, '', 1); return issues;
}

/** Omitted identities retain their sibling-name match; new fields receive an ID once at save. */
export function normalizeCmsFieldDefinitions<T extends CmsFieldDefinition>(fields: readonly T[], previous: readonly CmsFieldDefinition[] = []): T[] {
  return fields.map((field) => {
    const before = previous.find((item) => field.id != null && item.id === field.id) ?? previous.find((item) => item.name === field.name);
    const configuration = field.configuration ? { ...field.configuration } : field.configuration;
    if (configuration?.fields) configuration.fields = normalizeCmsFieldDefinitions(configuration.fields, before?.configuration?.fields);
    if (configuration?.blockTypes) configuration.blockTypes = configuration.blockTypes.map((block) => {
      const prior = before?.configuration?.blockTypes?.find((item) => item.code === block.code);
      return { ...block, id: block.id ?? prior?.id ?? crypto.randomUUID(), fields: normalizeCmsFieldDefinitions(block.fields, prior?.fields) };
    });
    return { ...field, id: field.id ?? before?.id ?? crypto.randomUUID(), configuration };
  });
}

export function createCmsFieldDefaultValue(field: CmsFieldDefinition): unknown {
  let value = field.defaultValue;
  if (typeof value === 'string' && ['number', 'switch', 'checkbox', 'reference', 'references', 'object', 'array', 'blocks'].includes(field.fieldType)) {
    try { value = JSON.parse(value); } catch { if (field.fieldType === 'checkbox') value = value.split(',').map((item) => item.trim()).filter(Boolean); }
  }
  if (value !== undefined && value !== null) return normalizeCmsStructuredValues([{ ...field, defaultValue: undefined }], { [field.name]: structuredClone(value) })[field.name];
  if (field.fieldType === 'object') {
    const nested = normalizeCmsStructuredValues(field.configuration?.fields ?? [], {});
    return Object.keys(nested).length ? nested : undefined;
  }
  return undefined;
}

/** Editor and all write boundaries share defaults and stable repeatable-instance IDs. */
export function normalizeCmsStructuredValues(fields: readonly CmsFieldDefinition[], values: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(values);
  for (const field of fields) {
    if (result[field.name] === undefined) { const fallback = createCmsFieldDefaultValue(field); if (fallback !== undefined) result[field.name] = fallback; }
    const value = result[field.name];
    if (field.fieldType === 'object' && isPlainObject(value)) result[field.name] = normalizeCmsStructuredValues(field.configuration?.fields ?? [], value);
    if (['array', 'blocks'].includes(field.fieldType) && Array.isArray(value)) result[field.name] = value.map((item) => {
      if (!isPlainObject(item)) return item;
      const children = field.fieldType === 'blocks' ? field.configuration?.blockTypes?.find((block) => block.code === item.blockType)?.fields ?? [] : field.configuration?.fields ?? [];
      return { ...normalizeCmsStructuredValues(children, item), _id: typeof item._id === 'string' && item._id ? item._id : crypto.randomUUID() };
    });
  }
  return result;
}

export function walkCmsStructuredValues(fields: readonly CmsFieldDefinition[], values: Record<string, unknown>, visitor: (field: CmsFieldDefinition, value: unknown, path: string, definitionPath: string) => void, prefix = 'extend', definitionPrefix = prefix): void {
  for (const field of fields) {
    const value = values[field.name]; const path = `${prefix}.${field.name}`; const definitionPath = `${definitionPrefix}.${field.name}`;
    visitor(field, value, path, definitionPath);
    if (field.fieldType === 'object' && isPlainObject(value)) walkCmsStructuredValues(field.configuration?.fields ?? [], value, visitor, path, definitionPath);
    if (['array', 'blocks'].includes(field.fieldType) && Array.isArray(value)) value.forEach((item, index) => {
      if (!isPlainObject(item)) return;
      const children = field.fieldType === 'blocks' ? field.configuration?.blockTypes?.find((block) => block.code === item.blockType)?.fields ?? [] : field.configuration?.fields ?? [];
      const childDefinitionPath = field.fieldType === 'blocks' ? `${definitionPath}[${String(item.blockType)}]` : `${definitionPath}[]`;
      walkCmsStructuredValues(children, item, visitor, `${path}.${index}`, childDefinitionPath);
    });
  }
}

export function validateCmsStructuredFields(fields: readonly CmsFieldDefinition[], values: Record<string, unknown>, strict: boolean, prefix = 'extend', depth = 1): CmsQualityIssue[] {
  const issues: CmsQualityIssue[] = [];
  const issue = (fieldPath: string, message: string, rule = 'model') => issues.push({ rule, severity: 'error', fieldPath, message });
  if (depth > CMS_MODEL_MAX_DEPTH) { issue(prefix, '内容组件嵌套超出上限'); return issues; }
  for (const key of Object.keys(values)) if (!fields.some((field) => field.name === key)) issue(`${prefix}.${key}`, '字段未在此模型版本定义');
  for (const field of fields) {
    const path = `${prefix}.${field.name}`; const value = values[field.name]; const config = field.configuration ?? {};
    const empty = value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
    const required = field.required || (config.requiredWhen && values[config.requiredWhen.field] === config.requiredWhen.equals);
    if (empty) { if (strict && required) issue(path, `「${field.label}」为发布必填`); continue; }
    if (typeof value === 'string') {
      if (config.minLength != null && value.length < config.minLength) issue(path, `至少 ${config.minLength} 个字符`);
      if (config.maxLength != null && value.length > config.maxLength) issue(path, `最多 ${config.maxLength} 个字符`);
    }
    const validReference = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item > 0;
    switch (field.fieldType) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) issue(path, '需要有限数字');
        else if ((config.min != null && value < config.min) || (config.max != null && value > config.max)) issue(path, '数值超出允许范围');
        break;
      case 'switch': if (typeof value !== 'boolean') issue(path, '需要布尔值'); break;
      case 'reference': if (!validReference(value)) issue(path, '请选择内容'); break;
      case 'references': if (!Array.isArray(value) || !value.every(validReference)) issue(path, '需要内容 ID 数组'); break;
      case 'object':
        if (!isPlainObject(value)) issue(path, '需要结构化对象');
        else issues.push(...validateCmsStructuredFields(config.fields ?? [], value, strict, path, depth + 1));
        break;
      case 'array': case 'blocks': {
        if (!Array.isArray(value)) { issue(path, '需要组件数组'); break; }
        if (value.length > (config.maxLength ?? 1000)) issue(path, '组件数量超出上限');
        if (config.minLength != null && value.length < config.minLength) issue(path, `至少 ${config.minLength} 个组件`);
        const ids = new Set<string>();
        value.forEach((item, index) => {
          if (!isPlainObject(item)) { issue(`${path}.${index}`, '组件需要对象'); return; }
          if (typeof item._id !== 'string' || !item._id || ids.has(item._id)) issue(`${path}.${index}._id`, '组件实例需要唯一稳定 ID');
          else ids.add(item._id);
          const { _id: _identity, blockType, ...data } = item;
          if (field.fieldType === 'blocks') {
            const block = config.blockTypes?.find((type) => type.code === blockType);
            if (!block) issue(`${path}.${index}.blockType`, '未知区块类型');
            else issues.push(...validateCmsStructuredFields(block.fields, data, strict, `${path}.${index}`, depth + 1));
          } else issues.push(...validateCmsStructuredFields(config.fields ?? [], blockType === undefined ? data : { ...data, blockType }, strict, `${path}.${index}`, depth + 1));
        }); break;
      }
      case 'select': case 'radio': case 'checkbox': {
        const options = field.resolvedOptions ?? field.options ?? []; const selected = field.fieldType === 'checkbox' ? value : [value];
        if (!Array.isArray(selected) || !selected.every((item) => typeof item === 'string' && options.some((option) => option.value === item))) issue(path, '选项已失效或配置为空');
        break;
      }
      case 'date': case 'datetime':
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(value) || Number.isNaN(Date.parse(value.replace(' ', 'T')))) issue(path, '日期格式无效');
        break;
      default: if (typeof value !== 'string') issue(path, '需要文本值');
    }
  }
  return issues;
}

export const cmsModelFieldChangeSchema = z.object({ path: z.string(), kind: z.enum(['added', 'removed', 'type_changed', 'changed']), beforeType: z.string().nullable(), afterType: z.string().nullable() });
export type CmsModelFieldChange = z.infer<typeof cmsModelFieldChangeSchema>;
export function diffCmsFieldDefinitions(before: readonly CmsFieldDefinition[], after: readonly CmsFieldDefinition[], prefix = ''): CmsModelFieldChange[] {
  const changes: CmsModelFieldChange[] = [];
  const stableField = (field: CmsFieldDefinition) => ({ name: field.name, label: field.label, fieldType: field.fieldType, required: !!field.required, defaultValue: field.defaultValue ?? null,
    options: field.resolvedOptions ?? field.options ?? [], configuration: { ...field.configuration, fields: undefined, blockTypes: undefined } });
  for (const name of new Set([...before.map((field) => field.name), ...after.map((field) => field.name)])) {
    const left = before.find((field) => field.name === name); const right = after.find((field) => field.name === name); const path = prefix ? `${prefix}.${name}` : name;
    const kind = !left ? 'added' : !right ? 'removed' : left.fieldType !== right.fieldType ? 'type_changed' : stableStringify(stableField(left)) !== stableStringify(stableField(right)) ? 'changed' : null;
    if (kind) changes.push({ path, kind, beforeType: left?.fieldType ?? null, afterType: right?.fieldType ?? null });
    if (left && right) {
      changes.push(...diffCmsFieldDefinitions(left.configuration?.fields ?? [], right.configuration?.fields ?? [], path));
      const a = left.configuration?.blockTypes ?? []; const b = right.configuration?.blockTypes ?? [];
      for (const code of new Set([...a.map((block) => block.code), ...b.map((block) => block.code)])) {
        const beforeBlock = a.find(block => block.code === code); const afterBlock = b.find(block => block.code === code);
        if (!beforeBlock || !afterBlock || beforeBlock.label !== afterBlock.label || beforeBlock.componentVersionId !== afterBlock.componentVersionId) changes.push({ path: `${path}[${code}]`, kind: !beforeBlock ? 'added' : !afterBlock ? 'removed' : 'changed', beforeType: beforeBlock ? 'block' : null, afterType: afterBlock ? 'block' : null });
        changes.push(...diffCmsFieldDefinitions(beforeBlock?.fields ?? [], afterBlock?.fields ?? [], `${path}[${code}]`));
      }
    }
  }
  return changes;
}

/** Conservative schema compatibility: presentation changes alone do not invalidate existing values. */
export function hasBreakingCmsFieldChanges(before: readonly CmsFieldDefinition[], after: readonly CmsFieldDefinition[]): boolean {
  for (const left of before) {
    const right = after.find(field => field.name === left.name);
    if (!right || left.fieldType !== right.fieldType) return true;
    const a = left.configuration ?? {}; const b = right.configuration ?? {};
    if ((!left.required && right.required && createCmsFieldDefaultValue(right) === undefined)
      || (!a.unique && b.unique)
      || (b.min != null && (a.min == null || b.min > a.min)) || (b.max != null && (a.max == null || b.max < a.max))
      || (b.minLength != null && (a.minLength == null || b.minLength > a.minLength)) || (b.maxLength != null && (a.maxLength == null || b.maxLength < a.maxLength))
      || (b.requiredWhen && stableStringify(a.requiredWhen ?? null) !== stableStringify(b.requiredWhen))) return true;
    if (['select', 'radio', 'checkbox'].includes(right.fieldType)) {
      const options = new Set((right.resolvedOptions ?? right.options ?? []).map(option => option.value));
      if ((left.resolvedOptions ?? left.options ?? []).some(option => !options.has(option.value))) return true;
    }
    if (b.referenceModelIds?.length && (!a.referenceModelIds?.length || a.referenceModelIds.some(id => !b.referenceModelIds!.includes(id)))) return true;
    if (hasBreakingCmsFieldChanges(a.fields ?? [], b.fields ?? [])) return true;
    for (const oldBlock of a.blockTypes ?? []) {
      const nextBlock = b.blockTypes?.find(block => block.code === oldBlock.code);
      if (!nextBlock || hasBreakingCmsFieldChanges(oldBlock.fields, nextBlock.fields)) return true;
    }
  }
  return after.some(field => !before.some(prior => prior.name === field.name) && (field.required || field.configuration?.requiredWhen) && createCmsFieldDefaultValue(field) === undefined);
}
