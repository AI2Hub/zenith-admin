import { describe, expect, it } from 'vitest';
import type { WorkflowFormField } from './types';
import { getWorkflowNumberingFields, resolveWorkflowNumberingParameters, stripWorkflowSerialNumberValues, validateWorkflowNumberingMapping } from './numbering';

describe('workflow numbering parameters', () => {
  const field = (type: WorkflowFormField['type'], extra = {}): WorkflowFormField => ({ key: 'category', label: '分类', type, ...extra });
  it('accepts scalar fields and rejects identity overrides, secret/system/complex fields and missing fields', () => {
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, [field('select')])).toEqual([]);
    for (const type of ['password', 'signature', 'attachment', 'serialNumber', 'detail'] as const) {
      expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, [field(type)])).not.toEqual([]);
    }
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, [field('select', { multiple: true })])).not.toEqual([]);
    expect(validateWorkflowNumberingMapping({ tenantId: 'formData.category' }, [field('text')])).not.toEqual([]);
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.missing' }, [field('text')])).not.toEqual([]);
  });
  it('reads only own scalar form properties and never permits arbitrary mapping expressions', () => {
    expect(resolveWorkflowNumberingParameters({ categoryCode: 'formData.category' }, { category: 42 })).toEqual({ categoryCode: 42 });
    expect(() => resolveWorkflowNumberingParameters({ categoryCode: 'formData.category' }, Object.create({ category: 'FORGED' }))).toThrow();
    expect(() => resolveWorkflowNumberingParameters({ categoryCode: 'formData.category' }, { category: {} })).toThrow();
    expect(() => resolveWorkflowNumberingParameters({ username: 'formData.category' }, { category: 'admin' })).toThrow();
  });
  it('strips fabricated serial fields through nested layouts and detail rows without mutating inputs', () => {
    const fields: WorkflowFormField[] = [{ key: 'group', label: '组', type: 'group', children: [{ key: 'serial', label: '编号', type: 'serialNumber' }] },
      { key: 'rows', label: '明细', type: 'detail', children: [{ key: 'serial', label: '编号', type: 'serialNumber' }] }];
    const values = { serial: 'FORGED', category: 'QJ', rows: [{ serial: 'FORGED', amount: 1 }] };
    expect(stripWorkflowSerialNumberValues(fields, values)).toEqual({ category: 'QJ', rows: [{ amount: 1 }] });
    expect(values.serial).toBe('FORGED');
  });
  it('only exposes declared scalar business variables as numbering sources in custom/external forms', () => {
    const fields = getWorkflowNumberingFields('external', [], { createComponent: '', variables: [
      { key: 'category', label: '分类', type: 'string' }, { key: 'owner', label: '责任人', type: 'user' },
    ] });
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, fields)).toEqual([]);
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.owner' }, fields)).not.toEqual([]);
  });
  it.each(['分类编码', 'category-code', '分类.编码'])('uses the declared field key %s literally, without evaluating expressions or paths', key => {
    const mapping = { categoryCode: `formData.${key}` };
    expect(validateWorkflowNumberingMapping(mapping, [field('text', { key })])).toEqual([]);
    expect(resolveWorkflowNumberingParameters(mapping, { [key]: 'PURCHASE' })).toEqual({ categoryCode: 'PURCHASE' });
    expect(validateWorkflowNumberingMapping(mapping, [])).not.toEqual([]);
    expect(() => resolveWorkflowNumberingParameters(mapping, Object.create({ [key]: 'FORGED' }))).toThrow();
  });
  it.each(['__proto__', 'constructor', 'prototype'])('rejects the prototype-sensitive key %s even if declared and present as an own property', key => {
    const mapping = { categoryCode: `formData.${key}` };
    expect(validateWorkflowNumberingMapping(mapping, [field('text', { key })])).not.toEqual([]);
    expect(() => resolveWorkflowNumberingParameters(mapping, { [key]: 'FORGED' })).toThrow('映射无效');
  });
  it('never traverses a dotted source into a nested object', () => {
    const mapping = { categoryCode: 'formData.category.code' };
    expect(() => resolveWorkflowNumberingParameters(mapping, { category: { code: 'FORGED' } })).toThrow();
    expect(resolveWorkflowNumberingParameters(mapping, { 'category.code': 'PURCHASE' })).toEqual({ categoryCode: 'PURCHASE' });
  });
});
