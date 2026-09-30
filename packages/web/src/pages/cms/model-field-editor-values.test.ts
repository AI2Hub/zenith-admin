import { describe, expect, it } from 'vitest';
import { createCmsComponentSchema, createCmsModelSchema, type CmsModelField } from '@zenith/shared/cms';
import { serializeCmsComponentFields, serializeCmsModelFields, toCmsFieldEditorValues } from './model-field-editor-values';

describe('CMS recursive model editor persistence', () => {
  it('round trips nested rules, media, choices and instance identities through the API contract', () => {
    const fields: CmsModelField[] = [{
      id: 41, modelId: 3, name: 'speakers', label: '讲师', fieldType: 'array', required: true, searchable: false,
      showInList: false, showInDetail: true, detailGroup: '课程', detailSort: 0, sort: 0,
      placeholder: null, defaultValue: '[{"_id":"speaker-default","name":"陈老师","role":"speaker"}]',
      optionSource: 'manual', dictCode: null, options: null, createdAt: '', updatedAt: '',
      configuration: { minLength: 1, maxLength: 6, fields: [
        { id: 'speaker-name', name: 'name', label: '姓名', fieldType: 'text', required: true, configuration: { maxLength: 80 } },
        { id: 'speaker-photo', name: 'photo', label: '照片', fieldType: 'image' },
        { id: 'speaker-role', name: 'role', label: '角色', fieldType: 'select', options: [{ value: 'speaker', label: '讲师' }] },
        { id: 'speaker-profile', name: 'profile', label: '介绍', fieldType: 'object', configuration: { fields: [
          { id: 'speaker-years', name: 'years', label: '年限', fieldType: 'number', defaultValue: 5, configuration: { min: 0, max: 100 } },
        ] } },
      ] },
    }];
    const payload = createCmsModelSchema.parse({ name: '课程', code: 'course', fields: serializeCmsModelFields(toCmsFieldEditorValues(fields)) });
    const saved = payload.fields[0];
    expect(saved.id).toBe(41);
    expect(JSON.parse(saved.defaultValue!)[0]).toMatchObject({ _id: 'speaker-default', name: '陈老师', role: 'speaker' });
    expect(saved.configuration?.fields?.[2]).toMatchObject({ id: 'speaker-role', options: [{ value: 'speaker', label: '讲师' }] });
    expect(saved.configuration?.fields?.[3].configuration?.fields?.[0]).toMatchObject({ id: 'speaker-years', defaultValue: 5, configuration: { min: 0, max: 100 } });
    expect(saved.showInDetail).toBe(true);
  });

  it('keeps version pins and stable definition IDs while stripping editor-only option text', () => {
    const edited = toCmsFieldEditorValues([{ id: 'hero', name: 'hero', label: '首屏', fieldType: 'blocks', configuration: { blockTypes: [
      { id: 'hero-person', code: 'person', label: '人物', componentVersionId: 7, fields: [
        { id: 'display-mode', name: 'mode', label: '样式', fieldType: 'radio', options: [{ value: 'compact', label: '紧凑' }] },
      ] },
    ] } }]);
    const payload = createCmsComponentSchema.parse({ name: '首屏组件', code: 'hero', fields: serializeCmsComponentFields(edited) });
    expect(payload.fields[0]).toMatchObject({ id: 'hero', configuration: { blockTypes: [
      { id: 'hero-person', componentVersionId: 7, fields: [{ id: 'display-mode', options: [{ value: 'compact', label: '紧凑' }] }] },
    ] } });
    expect(JSON.stringify(payload)).not.toContain('optionsText');
  });
});
