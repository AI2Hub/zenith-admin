import { CMS_MODEL_MAX_DEPTH, CMS_MODEL_MAX_FIELDS } from './constants';
import { normalizeCmsFieldDefinitions, validateCmsFieldDefinitions, createCmsFieldDefaultValue, validateCmsStructuredFields,
  type CmsFieldDefinition, type CmsNestedFieldDefinition, type CmsFieldConfiguration } from './model-design';

export class CmsModelDefinitionError extends Error {}
export type CmsModelDefinitionResolver = {
  dictionary: (code: string) => Promise<{ label: string; value: string }[]>;
  componentVersion: (id: number) => Promise<{
    component: { id: number; name: string; status: string; ownerSiteId: number | null };
    version: { fields: CmsNestedFieldDefinition[]; componentVersionIds: number[] };
  } | null>;
};

/** The server and Demo share compilation; only immutable-version and dictionary reads are injected. */
export async function resolveCmsFieldDefinitions<T extends CmsFieldDefinition>(input: readonly T[], options: { ownerSiteId: number | null; componentId?: number }, resolver: CmsModelDefinitionResolver) {
  const errors = validateCmsFieldDefinitions(input);
  if (errors.length) throw new CmsModelDefinitionError(errors.map((issue) => `${issue.fieldPath}: ${issue.message}`).join('；'));
  const componentVersionIds = new Set<number>();
  const dictionaryCache = new Map<string, ReturnType<CmsModelDefinitionResolver['dictionary']>>();
  const componentCache = new Map<number, ReturnType<CmsModelDefinitionResolver['componentVersion']>>();
  let count = 0;
  const dictionary = async (code: string) => {
    if (!dictionaryCache.has(code)) dictionaryCache.set(code, resolver.dictionary(code));
    return dictionaryCache.get(code)!;
  };
  const fromComponent = async (versionId: number, depth: number, stack: readonly number[]): Promise<CmsNestedFieldDefinition[]> => {
    if (!componentCache.has(versionId)) componentCache.set(versionId, resolver.componentVersion(versionId));
    const entry = await componentCache.get(versionId);
    if (!entry) throw new CmsModelDefinitionError('引用的内容组件版本不存在');
    if (entry.component.status !== 'enabled') throw new CmsModelDefinitionError(`组件「${entry.component.name}」已停用`);
    if (entry.component.ownerSiteId != null && entry.component.ownerSiteId !== options.ownerSiteId) throw new CmsModelDefinitionError('不能引用其他站点专属组件；共享模型只能引用共享组件');
    if (stack.includes(entry.component.id)) throw new CmsModelDefinitionError('内容组件不能循环引用自身或上级组件');
    componentVersionIds.add(versionId);
    for (const dependencyId of entry.version.componentVersionIds) componentVersionIds.add(dependencyId);
    // The version already contains frozen dictionary options. Never resolve them against the current dictionary.
    return expand(entry.version.fields, depth, [...stack, entry.component.id], true);
  };
  const expand = async <F extends CmsFieldDefinition>(fields: readonly F[], depth: number, stack: readonly number[], frozen = false): Promise<F[]> => {
    if (depth > CMS_MODEL_MAX_DEPTH) throw new CmsModelDefinitionError(`展开后字段深度不能超过 ${CMS_MODEL_MAX_DEPTH} 层`);
    const result: F[] = [];
    for (const field of normalizeCmsFieldDefinitions(fields)) {
      if (++count > CMS_MODEL_MAX_FIELDS) throw new CmsModelDefinitionError(`展开后字段总数不能超过 ${CMS_MODEL_MAX_FIELDS} 个`);
      const configuration: CmsFieldConfiguration | null | undefined = field.configuration ? { ...field.configuration } : field.configuration;
      if (configuration?.componentVersionId && !frozen) configuration.fields = await fromComponent(configuration.componentVersionId, depth + 1, stack);
      else if (configuration?.fields) configuration.fields = await expand(configuration.fields, depth + 1, stack, frozen);
      if (configuration?.blockTypes) {
        configuration.blockTypes = await Promise.all(configuration.blockTypes.map(async (block) => ({ ...block,
          fields: block.componentVersionId && !frozen ? await fromComponent(block.componentVersionId, depth + 1, stack) : await expand(block.fields, depth + 1, stack, frozen),
        })));
      }
      const resolvedOptions = frozen && field.resolvedOptions !== undefined ? field.resolvedOptions
        : field.optionSource === 'dict' ? await dictionary(field.dictCode ?? '') : field.options ?? [];
      if (['select', 'radio', 'checkbox'].includes(field.fieldType) && !resolvedOptions.length) throw new CmsModelDefinitionError(`字段「${field.label}」没有有效选项`);
      if (['object', 'array'].includes(field.fieldType) && !configuration?.fields?.length) throw new CmsModelDefinitionError(`字段「${field.label}」必须定义组件子字段`);
      if (field.fieldType === 'blocks' && !configuration?.blockTypes?.length) throw new CmsModelDefinitionError(`字段「${field.label}」必须定义允许的区块`);
      const compiled = { ...field, configuration, resolvedOptions };
      const defaultValue = createCmsFieldDefaultValue(compiled);
      if (defaultValue !== undefined) {
        const problems = validateCmsStructuredFields([compiled], { [field.name]: defaultValue }, false);
        if (problems.length) throw new CmsModelDefinitionError(`字段「${field.label}」默认值无效：${problems.map((issue) => issue.message).join('；')}`);
      }
      result.push(compiled);
    }
    return result;
  };
  const fields = await expand(input, 1, options.componentId ? [options.componentId] : []);
  const expandedErrors = validateCmsFieldDefinitions(fields);
  if (expandedErrors.length) throw new CmsModelDefinitionError(expandedErrors.map((issue) => issue.message).join('；'));
  return { fields, componentVersionIds: [...componentVersionIds].sort((a, b) => a - b) };
}

