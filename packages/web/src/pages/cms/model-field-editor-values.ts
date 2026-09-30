import { createCmsFieldDefaultValue, type CmsFieldConfiguration, type CmsFieldDefinition, type CmsModelFieldInput, type CmsNestedFieldDefinition } from '@zenith/shared/cms';

export type CmsFieldEditorValue = CmsFieldDefinition & {
  optionsText?: string;
  showInList?: boolean;
  showInDetail?: boolean;
  detailGroup?: string | null;
};

export function toCmsFieldEditorValues(fields: readonly CmsFieldDefinition[]): CmsFieldEditorValue[] {
  return fields.map((field) => ({
    ...field,
    defaultValue: createCmsFieldDefaultValue(field),
    optionsText: (field.options ?? []).map((option) => `${option.value}|${option.label}`).join('\n'),
    configuration: field.configuration ? {
      ...field.configuration,
      fields: field.configuration.fields ? toCmsFieldEditorValues(field.configuration.fields) as CmsNestedFieldDefinition[] : undefined,
      blockTypes: field.configuration.blockTypes?.map((block) => ({ ...block, fields: toCmsFieldEditorValues(block.fields) as CmsNestedFieldDefinition[] })),
    } : {},
  }));
}

function serializeConfiguration(configuration?: CmsFieldConfiguration | null): CmsFieldConfiguration {
  const result: CmsFieldConfiguration = Object.fromEntries(Object.entries(configuration ?? {}).filter(([, value]) => value !== null && value !== undefined));
  if (!result.requiredWhen?.field) delete result.requiredWhen;
  if (result.fields) result.fields = serializeCmsComponentFields(result.fields);
  if (result.blockTypes) result.blockTypes = result.blockTypes.map((block) => ({ ...block, fields: serializeCmsComponentFields(block.fields) }));
  return result;
}

function serializeField(field: CmsFieldEditorValue): Omit<CmsNestedFieldDefinition, 'id'> {
  const options = field.optionSource === 'dict' ? null : (field.optionsText !== undefined
    ? field.optionsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.indexOf('|');
      const value = (separator < 0 ? line : line.slice(0, separator)).trim();
      return { value, label: (separator < 0 ? value : line.slice(separator + 1).trim()) || value };
    }) : field.options ?? null);
  return {
    name: field.name, label: field.label, fieldType: field.fieldType, required: field.required ?? false,
    searchable: field.searchable ?? false, placeholder: field.placeholder, defaultValue: field.defaultValue,
    optionSource: field.optionSource ?? 'manual', dictCode: field.optionSource === 'dict' ? field.dictCode : null,
    options, configuration: serializeConfiguration(field.configuration),
  };
}

export function serializeCmsComponentFields(fields: readonly CmsFieldEditorValue[]): CmsNestedFieldDefinition[] {
  return fields.map((field) => ({ ...serializeField(field), id: typeof field.id === 'string' ? field.id : crypto.randomUUID() }));
}

export function serializeCmsModelFields(fields: readonly CmsFieldEditorValue[]): (CmsModelFieldInput & { fieldType: CmsFieldDefinition['fieldType'] })[] {
  return fields.map((field, index) => ({
    ...serializeField(field), id: typeof field.id === 'number' ? field.id : undefined,
    defaultValue: field.defaultValue == null ? null : typeof field.defaultValue === 'string' ? field.defaultValue : JSON.stringify(field.defaultValue),
    showInList: field.showInList ?? false, showInDetail: field.showInDetail ?? false,
    detailGroup: field.detailGroup, sort: index, detailSort: index,
  }));
}
