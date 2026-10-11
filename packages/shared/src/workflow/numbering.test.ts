import { describe, expect, it } from 'vitest';
import type { WorkflowFormField } from './types';
import { renderBusinessNumber } from '../platform/numbering';
import { getWorkflowNumberingFields, resolveWorkflowNumberingMapping, resolveWorkflowNumberingParameters, stripWorkflowSerialNumberValues, validateWorkflowNumberingMapping } from './numbering';

describe('workflow numbering parameters', () => {
  const field = (type: WorkflowFormField['type'], extra = {}): WorkflowFormField => ({ key: 'category', label: '分类', type, ...extra });
  it('accepts scalar fields and rejects identity overrides, secret/system/complex fields and missing fields', () => {
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, [field('select')])).toEqual([]);
    for (const type of ['password', 'signature', 'attachment', 'serialNumber', 'detail'] as const) {
      expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, [field(type)])).not.toEqual([]);
    }
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, [field('text', { multiple: true })])).not.toEqual([]);
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
      { key: 'department', label: '责任部门', type: 'dept' }, { key: 'urgent', label: '加急', type: 'boolean' },
    ] });
    expect(validateWorkflowNumberingMapping({ categoryCode: 'formData.category' }, fields)).toEqual([]);
    const mapping = resolveWorkflowNumberingMapping(['FORM.责任人', 'FORM.责任部门', 'FORM.加急'], {}, fields);
    expect(mapping).toEqual({ 'FORM.责任人': 'formData.owner', 'FORM.责任部门': 'formData.department', 'FORM.加急': 'formData.urgent' });
    expect(resolveWorkflowNumberingParameters(mapping, { owner: 12, department: 'RD', urgent: false })).toEqual({ 'FORM.责任人': 12, 'FORM.责任部门': 'RD', 'FORM.加急': 'false' });
    expect(() => resolveWorkflowNumberingParameters(mapping, { owner: { id: 12 }, department: 'RD', urgent: true })).toThrow('有效的表单字段');
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

  it('resolves several FORM keys or unique labels at publication and freezes actual literal keys', () => {
    const fields: WorkflowFormField[] = [
      { key: 'project.code', label: '项目编码', type: 'text' },
      { key: 'amount', label: '项目编码', type: 'amount' },
      { key: '项目编码', label: '编码', type: 'text' },
      { key: 'reason', label: '报销事由', type: 'textarea' },
      { key: 'category', label: '分类', type: 'select' },
    ];
    const mapping = resolveWorkflowNumberingMapping(['FORM.project.code', 'FORM.项目编码', 'FORM.报销事由', 'categoryCode'], { categoryCode: 'formData.category' }, fields);
    expect(mapping).toEqual({ 'FORM.project.code': 'formData.project.code', 'FORM.项目编码': 'formData.项目编码', 'FORM.报销事由': 'formData.reason', categoryCode: 'formData.category' });
    const renamed = fields.map(item => ({ ...item, label: '新名称' }));
    expect(validateWorkflowNumberingMapping(mapping, renamed)).toEqual([]);
    expect(resolveWorkflowNumberingParameters(mapping, { 'project.code': 'PROJECT', 项目编码: 'BX', reason: '差旅申请', category: 'TRAVEL' })).toEqual({ 'FORM.project.code': 'PROJECT', 'FORM.项目编码': 'BX', 'FORM.报销事由': '差旅申请', categoryCode: 'TRAVEL' });
    expect(() => resolveWorkflowNumberingParameters(mapping, { project: { code: 'FORGED' }, 项目编码: 'BX', reason: '差旅申请', category: 'TRAVEL' })).toThrow('project.code');
  });

  it('rejects ambiguous labels, duplicate keys, missing required category and non-serializable sources', () => {
    const fields: WorkflowFormField[] = [field('text', { key: 'first' }), field('text', { key: 'second' })];
    expect(() => resolveWorkflowNumberingMapping(['FORM.分类'], {}, fields)).toThrow('名称不唯一');
    expect(() => resolveWorkflowNumberingMapping(['categoryCode'], {}, fields)).toThrow('必须映射');
    expect(() => resolveWorkflowNumberingMapping(['FORM.category'], {}, [field('text'), field('text')])).toThrow('名称不唯一');
    for (const type of ['password', 'pinCode', 'signature', 'attachment', 'image', 'serialNumber', 'detail', 'richtext'] as const) {
      expect(() => resolveWorkflowNumberingMapping(['FORM.category'], {}, [field(type)])).toThrow('不支持编号');
    }
    expect(() => resolveWorkflowNumberingMapping(['FORM.category'], {}, [field('text', { multiple: true })])).toThrow('不支持编号');
    expect(() => resolveWorkflowNumberingMapping(['FORM.category'], {}, [field('row', { columns: [{ span: 24, fields: [field('password')] }] })])).toThrow('不支持编号');
  });

  it('normalizes FORM prefix spelling, respects explicit remapping and rejects contradictory aliases or identity overrides', () => {
    const fields = [field('text'), field('text', { key: 'other', label: '其它分类' })];
    expect(resolveWorkflowNumberingMapping(['FORM.category'], { 'form.category': 'formData.other' }, fields)).toEqual({ 'FORM.category': 'formData.other' });
    expect(resolveWorkflowNumberingParameters({ 'form.category': 'formData.other' }, { other: 'OVERRIDE' })).toEqual({ 'FORM.category': 'OVERRIDE' });
    expect(() => resolveWorkflowNumberingMapping(['FORM.category'], { 'form.category': 'formData.other', 'FORM.category': 'formData.category' }, fields)).toThrow('冲突映射');
    expect(validateWorkflowNumberingMapping({ USER: 'formData.category' }, fields).join()).toContain('不允许');
    const forged = Object.fromEntries([['__proto__', 'formData.category']]);
    expect(validateWorkflowNumberingMapping(forged, fields).join()).toContain('不允许');
  });

  it('supports form fields in nested layouts without treating detail children as top-level values', () => {
    const fields: WorkflowFormField[] = [{ key: 'layout', label: '分组', type: 'group', children: [
      { key: 'tabs', label: '页签', type: 'tabs', panes: [{ title: '资料', fields: [field('text')] }] },
      { key: 'detail', label: '明细', type: 'detail', children: [{ key: 'private', label: '明细字段', type: 'text' }] },
    ] }];
    expect(resolveWorkflowNumberingMapping(['FORM.分类'], {}, fields)).toEqual({ 'FORM.分类': 'formData.category' });
    expect(() => resolveWorkflowNumberingMapping(['FORM.private'], {}, fields)).toThrow('不存在');
  });

  it('renders declared multi-choice, people, department and cascaded values with the original comma joining', () => {
    const fields: WorkflowFormField[] = [
      { key: 'choices', label: '分类', type: 'select', multiple: true },
      { key: 'people', label: '人员', type: 'userSelect', multiple: true },
      { key: 'departments', label: '部门', type: 'deptSelect', multiple: true },
      { key: 'area', label: '地区', type: 'region' },
      { key: 'tags', label: '标签', type: 'tags' },
      { key: 'flags', label: '选项', type: 'checkbox' },
      { key: 'path', label: '级联', type: 'cascader' },
      { key: 'other', label: '多选', type: 'multiSelect' },
      { key: 'dates', label: '区间', type: 'dateRange' },
    ];
    const parameters = fields.map(item => `FORM.${item.label}`);
    const mapping = resolveWorkflowNumberingMapping(parameters, {}, fields);
    const context = resolveWorkflowNumberingParameters(mapping, {
      choices: ['采购', '报销'], people: [1, 2], departments: ['RD', 'HR'], area: ['上海', '浦东'],
      tags: ['重要', ' 加急 '], flags: [true, false], path: ['A', 'B'], other: [0, 3], dates: ['20261001', '20261011'],
    });
    expect(context['FORM.分类']).toBe('采购,报销');
    expect(context['FORM.人员']).toBe('1,2');
    expect(context['FORM.选项']).toBe('true,false');
    expect(renderBusinessNumber({
      template: `${parameters.map(parameter => `{${parameter}}`).join('-')}-{SEQ:2}`, start: '0', step: '1', width: 4,
      resetPeriod: 'never', timezone: 'Asia/Shanghai', scope: 'owner',
    }, { sequence: '0', at: '2026-10-11T02:00:00Z', context }, 'workflow.instance')).toBe('采购,报销-1,2-RD,HR-上海,浦东-重要,加急-true,false-A,B-0,3-20261001,20261011-00');
  });

  it('rejects incomplete or structured multi-choice values before issuing a number', () => {
    const mapping = resolveWorkflowNumberingMapping(['FORM.category'], {}, [field('select', { multiple: true })]);
    for (const category of [[], [{}], [['NESTED']], [null], [undefined], [Number.NaN], [Number.POSITIVE_INFINITY], [Symbol('value')], Array(1), ['']]) {
      expect(() => resolveWorkflowNumberingParameters(mapping, { category })).toThrow('有效的表单字段');
    }
    for (const type of ['password', 'signature', 'attachment', 'image', 'detail', 'richtext', 'serialNumber'] as const) {
      expect(() => resolveWorkflowNumberingMapping(['FORM.category'], {}, [field(type, { multiple: true })])).toThrow('不支持编号');
    }
  });
});
