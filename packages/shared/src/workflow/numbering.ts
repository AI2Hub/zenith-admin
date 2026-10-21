import type { WorkflowCustomFormConfig, WorkflowFormField } from './types';
import type { WorkflowFormType } from './constants';
import { normalizeNumberingParameter, parseNumberingFormFieldSource, parseNumberingFormParameter } from '../platform/numbering-reference';

/** Match designer fields to the variables explicitly declared by custom/external business forms. */
export function getWorkflowNumberingFields(formType: WorkflowFormType, designerFields: WorkflowFormField[], customForm?: WorkflowCustomFormConfig | null): WorkflowFormField[] {
  if (formType === 'designer') return designerFields;
  const types: Record<NonNullable<WorkflowCustomFormConfig['variables']>[number]['type'], WorkflowFormField['type']> = {
    string: 'text', number: 'number', boolean: 'switch', date: 'date', user: 'userSelect', dept: 'deptSelect',
  };
  return (customForm?.variables ?? []).map(variable => ({ key: variable.key, label: variable.label, type: types[variable.type],
    ...(variable.optionItems ? { optionItems: variable.optionItems, options: variable.optionItems.map(item => item.value) } : {}) }));
}

/** Plain values and selection arrays can appear in identifiers; rich or secret data cannot. */
export function isWorkflowNumberingParameterField(field: Pick<WorkflowFormField, 'type' | 'multiple'>): boolean {
  if (['select', 'multiSelect', 'checkbox', 'tags', 'userSelect', 'deptSelect', 'dictSelect', 'cascader', 'region', 'dateRange'].includes(field.type)) return true;
  return !field.multiple && [
    'text', 'textarea', 'number', 'date', 'time', 'select', 'autoComplete', 'radio', 'switch',
    'slider', 'colorPicker', 'amount', 'phone', 'email', 'idCard', 'url', 'rate', 'formula', 'dictSelect', 'nps', 'userSelect', 'deptSelect',
  ].includes(field.type);
}

function scalarFields(fields: readonly WorkflowFormField[]): WorkflowFormField[] {
  return fields.flatMap(field => {
    if (field.type === 'row') return (field.columns ?? []).flatMap(column => scalarFields(column.fields));
    if (field.type === 'tabs' || field.type === 'steps') return (field.panes ?? []).flatMap(pane => scalarFields(pane.fields));
    if (field.type === 'group') return scalarFields(field.children ?? []);
    return [field];
  });
}

function normalizeWorkflowNumberingMapping(mapping: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [parameter, source] of Object.entries(mapping)) {
    const canonical = normalizeNumberingParameter(parameter);
    if (Object.hasOwn(normalized, canonical) && normalized[canonical] !== source) throw new Error(`编号参数 ${canonical} 存在冲突映射`);
    normalized[canonical] = source;
  }
  return normalized;
}

export function validateWorkflowNumberingMapping(mapping: Readonly<Record<string, string>>, fields: readonly WorkflowFormField[]): string[] {
  const available = scalarFields(fields);
  let normalized;
  try { normalized = normalizeWorkflowNumberingMapping(mapping); }
  catch (error) { return [error instanceof Error ? error.message : '编号参数映射无效']; }
  return Object.entries(normalized).flatMap(([parameter, source]) => {
    if (parameter !== 'categoryCode' && parseNumberingFormParameter(parameter) === undefined) return [`编号参数 ${parameter} 不允许通过表单覆盖`];
    const key = parseNumberingFormFieldSource(source);
    if (key === undefined) return [`编号参数 ${parameter} 必须引用有效的表单字段（__proto__、constructor、prototype 为保留字）`];
    const matches = available.filter(item => item.key === key);
    return matches.length !== 1 || !isWorkflowNumberingParameterField(matches[0]!) ? [`编号参数引用的字段 ${source} 不存在、重复或不支持编号`] : [];
  });
}

/** Resolve labels only at publication, then freeze actual keys so a rename cannot change issuance. */
export function resolveWorkflowNumberingMapping(requiredParameters: readonly string[], mapping: Readonly<Record<string, string>>, fields: readonly WorkflowFormField[]): Record<string, string> {
  const normalized = normalizeWorkflowNumberingMapping(mapping);
  const errors = validateWorkflowNumberingMapping(normalized, fields);
  const available = scalarFields(fields);
  const result: Record<string, string> = {};
  for (const parameter of new Set(requiredParameters.map(normalizeNumberingParameter))) {
    if (Object.hasOwn(normalized, parameter)) {
      result[parameter] = normalized[parameter]!;
      continue;
    }
    const reference = parseNumberingFormParameter(parameter);
    if (reference === undefined) {
      errors.push(`编号参数 ${parameter} 必须映射到表单字段`);
      continue;
    }
    const keyMatches = available.filter(field => field.key === reference);
    const matches = keyMatches.length ? keyMatches : available.filter(field => field.label === reference);
    if (matches.length !== 1 || !isWorkflowNumberingParameterField(matches[0]!)) {
      errors.push(`编号参数 ${parameter} 引用的字段不存在、名称不唯一或不支持编号`);
      continue;
    }
    const source = `formData.${matches[0]!.key}`;
    if (parseNumberingFormFieldSource(source) === undefined) {
      errors.push(`编号参数 ${parameter} 引用的字段编码无效`);
      continue;
    }
    result[parameter] = source;
  }
  if (errors.length) throw new Error([...new Set(errors)].join('；'));
  return result;
}

export function resolveWorkflowNumberingParameters(mapping: Readonly<Record<string, string>>, values: Readonly<Record<string, unknown>>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [parameter, source] of Object.entries(normalizeWorkflowNumberingMapping(mapping))) {
    const field = parseNumberingFormFieldSource(source);
    if ((parameter !== 'categoryCode' && parseNumberingFormParameter(parameter) === undefined) || field === undefined) throw new Error('编号参数映射无效');
    const value = Object.hasOwn(values, field) ? values[field] : undefined;
    const plainValues = Array.isArray(value) ? Array.from(value) : [value];
    if (!plainValues.length || plainValues.some(item => !['string', 'number', 'boolean'].includes(typeof item) || item === '' || (typeof item === 'number' && !Number.isFinite(item)))) {
      throw new Error(`编号参数 ${parameter} 需要有效的表单字段 ${field}`);
    }
    result[normalizeNumberingParameter(parameter)] = Array.isArray(value) ? plainValues.map(String).join(',') : typeof value === 'boolean' ? String(value) : value as string | number;
  }
  return result;
}

/** Serial controls display instance metadata; client/default values never become submitted data. */
export function stripWorkflowSerialNumberValues(fields: readonly WorkflowFormField[], values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const clean = { ...values };
  for (const field of scalarFields(fields)) {
    if (field.type === 'serialNumber') delete clean[field.key];
    if (field.type === 'detail' && Array.isArray(clean[field.key])) {
      clean[field.key] = (clean[field.key] as unknown[]).map(row => row && typeof row === 'object' && !Array.isArray(row)
        ? stripWorkflowSerialNumberValues(field.children ?? [], row as Record<string, unknown>) : row);
    }
  }
  return clean;
}
