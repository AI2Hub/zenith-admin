import type { WorkflowCustomFormConfig, WorkflowFormField } from './types';
import type { WorkflowFormType } from './constants';
import { parseNumberingFormFieldSource } from '../platform/numbering-reference';

/** Match designer fields to the variables explicitly declared by custom/external business forms. */
export function getWorkflowNumberingFields(formType: WorkflowFormType, designerFields: WorkflowFormField[], customForm?: WorkflowCustomFormConfig | null): WorkflowFormField[] {
  if (formType === 'designer') return designerFields;
  const types: Record<NonNullable<WorkflowCustomFormConfig['variables']>[number]['type'], WorkflowFormField['type']> = {
    string: 'text', number: 'number', boolean: 'switch', date: 'date', user: 'userSelect', dept: 'deptSelect',
  };
  return (customForm?.variables ?? []).map(variable => ({ key: variable.key, label: variable.label, type: types[variable.type] }));
}

/** Only scalar fields explicitly suitable for a public business identifier can be mapped. */
export function isWorkflowNumberingParameterField(field: Pick<WorkflowFormField, 'type' | 'multiple'>): boolean {
  return !field.multiple && ['text', 'number', 'select', 'radio', 'date'].includes(field.type);
}

function scalarFields(fields: readonly WorkflowFormField[]): WorkflowFormField[] {
  return fields.flatMap(field => {
    if (field.type === 'row') return (field.columns ?? []).flatMap(column => scalarFields(column.fields));
    if (field.type === 'tabs' || field.type === 'steps') return (field.panes ?? []).flatMap(pane => scalarFields(pane.fields));
    if (field.type === 'group') return scalarFields(field.children ?? []);
    return [field];
  });
}

export function validateWorkflowNumberingMapping(mapping: Readonly<Record<string, string>>, fields: readonly WorkflowFormField[]): string[] {
  const available = scalarFields(fields);
  return Object.entries(mapping).flatMap(([parameter, source]) => {
    if (parameter !== 'categoryCode') return [`编号参数 ${parameter} 不允许通过表单覆盖`];
    const key = parseNumberingFormFieldSource(source);
    if (key === undefined) return [`编号参数 ${parameter} 必须引用有效的表单字段（__proto__、constructor、prototype 为保留字）`];
    const field = available.find(item => item.key === key);
    return !field || !isWorkflowNumberingParameterField(field) ? [`编号参数引用的字段 ${source} 不存在或不支持编号`] : [];
  });
}

export function resolveWorkflowNumberingParameters(mapping: Readonly<Record<string, string>>, values: Readonly<Record<string, unknown>>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [parameter, source] of Object.entries(mapping)) {
    const field = parseNumberingFormFieldSource(source);
    if (parameter !== 'categoryCode' || field === undefined) throw new Error('编号参数映射无效');
    const value = Object.hasOwn(values, field) ? values[field] : undefined;
    if ((typeof value !== 'string' && typeof value !== 'number') || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`编号参数 ${parameter} 需要有效的表单字段 ${field}`);
    }
    result[parameter] = value;
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
