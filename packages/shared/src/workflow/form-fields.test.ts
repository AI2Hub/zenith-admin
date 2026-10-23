import { describe, expect, it } from 'vitest';
import { evaluateWorkflowCondition } from './conditions';
import { flattenWorkflowValueFields } from './form-fields';
import { getWorkflowNumberingFields } from './numbering';
import type { WorkflowFormField } from './types';

const fields: WorkflowFormField[] = [
  { key: 'layout', label: '分栏', type: 'row', columns: [{ span: 24, fields: [
    { key: 'group', label: '分组', type: 'group', children: [
      { key: 'category', label: '类别', type: 'select', options: ['A', 'B'] },
      { key: 'items', label: '明细', type: 'detail', children: [
        { key: 'itemCategory', label: '明细类别', type: 'select', options: ['A', 'B'] },
        { key: 'amount', label: '明细金额', type: 'number' },
      ] },
    ] },
  ] }] },
  { key: 'tabs', label: '标签页', type: 'tabs', panes: [{ title: '人员', fields: [
    { key: 'owner', label: '负责人', type: 'userSelect' },
  ] }] },
  { key: 'steps', label: '分步', type: 'steps', panes: [{ title: '部门', fields: [
    { key: 'department', label: '部门', type: 'deptSelect' },
  ] }] },
  { key: 'note', label: '说明', type: 'description' },
  { key: 'separator', label: '分割线', type: 'divider' },
];

describe('workflow value field references', () => {
  it('exposes values inside every layout while retaining the detail array boundary and field metadata', () => {
    const before = structuredClone(fields);
    const flattened = flattenWorkflowValueFields(fields);
    expect(flattened.map(field => field.key)).toEqual(['category', 'items', 'owner', 'department']);
    expect(flattened[0].options).toEqual(['A', 'B']);
    expect(flattened[1].children?.map(field => field.key)).toEqual(['itemCategory', 'amount']);
    expect(fields).toEqual(before);
  });

  it('offers routable scalar fields without exposing detail columns as top-level conditions', () => {
    const flattened = flattenWorkflowValueFields(fields);
    expect(flattened.filter(field => field.type === 'select' || field.type === 'radio').map(field => field.key)).toEqual(['category']);
    const values = { category: 'A', items: [{ itemCategory: 'B', amount: 100 }] };
    expect(evaluateWorkflowCondition({ field: 'category', operator: 'eq', value: 'A' }, values)).toBe(true);
    expect(evaluateWorkflowCondition({ field: 'items', aggregate: 'sum', aggregateField: 'amount', operator: 'eq', value: 100 }, values)).toBe(true);
    expect(evaluateWorkflowCondition({ field: 'itemCategory', operator: 'eq', value: 'B' }, values)).toBe(false);
  });

  it.each(['custom', 'external'] as const)('keeps the declared variables of %s forms', formType => {
    const variables = getWorkflowNumberingFields(formType, fields, { variables: [
      { key: 'owner', label: '负责人', type: 'user' },
      { key: 'department', label: '部门', type: 'dept' },
    ] });
    expect(flattenWorkflowValueFields(variables)).toEqual([
      { key: 'owner', label: '负责人', type: 'userSelect' },
      { key: 'department', label: '部门', type: 'deptSelect' },
    ]);
  });

  it('does not offer empty layout containers as value fields', () => {
    expect(flattenWorkflowValueFields([
      { key: 'row', label: '分栏', type: 'row' },
      { key: 'tabs', label: '标签页', type: 'tabs' },
      { key: 'steps', label: '分步', type: 'steps' },
      { key: 'group', label: '分组', type: 'group' },
    ])).toEqual([]);
  });
});
