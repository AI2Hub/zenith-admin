import { Fragment, useState, type CSSProperties } from 'react';
import { ArrayField, Banner, Button, Divider, Form, Select, Space, Typography, useFormApi, useFormState } from '@douyinfe/semi-ui';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { getByPath } from '@zenith/shared/core';
import { CMS_FIELD_OPTION_SOURCE_LABELS, CMS_FIELD_OPTION_SOURCES, CMS_FIELD_TYPES, CMS_FIELD_TYPES_WITH_OPTIONS, CMS_FIELD_TYPE_LABELS, CMS_MODEL_MAX_DEPTH, type CmsFieldDefinition, type CmsNestedFieldDefinition } from '@zenith/shared/cms';
import { useAllCmsModels } from '@/hooks/queries/cms-models';
import { useAllCmsComponents, useCmsComponentVersions } from '@/hooks/queries/cms-components';
import { useDictList } from '@/hooks/queries/dicts';
import { useDictItems } from '@/hooks/useDictItems';
import { CmsModelFieldControl } from './model-field-renderer';
import { toCmsFieldEditorValues, type CmsFieldEditorValue } from './model-field-editor-values';

const fieldOptions = CMS_FIELD_TYPES.map((type) => ({ value: type, label: CMS_FIELD_TYPE_LABELS[type] }));
const optionSources = CMS_FIELD_OPTION_SOURCES.map((source) => ({ value: source, label: CMS_FIELD_OPTION_SOURCE_LABELS[source] }));
const structuredTypes = new Set(['object', 'array', 'blocks']);

/** Stable identities belong to definitions, so reordering or renaming does not replace a child. */
export function CmsFieldDefinitionsEditor({ field, siteId, depth = 1, root = false }: Readonly<{ field: string; siteId?: number; depth?: number; root?: boolean }>) {
  const api = useFormApi();
  if (depth > CMS_MODEL_MAX_DEPTH) return <Banner type="danger" description={`字段最多嵌套 ${CMS_MODEL_MAX_DEPTH} 层，请减少嵌套。`} />;
  const move = (index: number, offset: number) => {
    const values = [...(api.getValue(field) as CmsFieldEditorValue[] ?? [])];
    [values[index], values[index + offset]] = [values[index + offset], values[index]];
    api.setValue(field, values);
  };
  return <ArrayField field={field}>{({ arrayFields, addWithInitValue }) => <Space vertical align="start" style={{ width: '100%' }}>
    {arrayFields.map(({ field: path, key, remove }, index) => <Fragment key={key}>
      {index > 0 ? <Divider margin={16} /> : null}
      <div style={{ width: '100%' }}>
        <Space spacing={4}>
          <Typography.Text strong>字段 {index + 1}</Typography.Text>
          <Button aria-label="上移字段" icon={<ArrowUp size={14} />} disabled={index === 0} onClick={() => move(index, -1)} />
          <Button aria-label="下移字段" icon={<ArrowDown size={14} />} disabled={index === arrayFields.length - 1} onClick={() => move(index, 1)} />
          <Button aria-label="删除字段" theme="borderless" type="danger" icon={<Trash2 size={14} />} onClick={remove} />
        </Space>
        <FieldDefinitionRow field={path} siblingsPath={field} siteId={siteId} depth={depth} root={root} />
      </div>
    </Fragment>)}
    <Button icon={<Plus size={14} />} disabled={arrayFields.length >= 100} onClick={() => addWithInitValue({ ...(root ? {} : { id: crypto.randomUUID() }), fieldType: 'text', configuration: {}, optionSource: 'manual' })}>添加字段</Button>
  </Space>}</ArrayField>;
}

function FieldDefinitionRow({ field, siblingsPath, siteId, depth, root }: Readonly<{ field: string; siblingsPath: string; siteId?: number; depth: number; root: boolean }>) {
  const state = useFormState();
  const api = useFormApi();
  const definition = getByPath(state.values, field) as CmsFieldEditorValue | undefined;
  const dictionary = useDictItems(definition?.optionSource === 'dict' ? definition.dictCode ?? '' : '');
  const [showDefault, setShowDefault] = useState(definition?.defaultValue !== undefined && definition?.defaultValue !== null);
  const [defaultEditorMounted, setDefaultEditorMounted] = useState(showDefault);
  const type = definition?.fieldType ?? 'text';
  const availableTypes = fieldOptions.map((option) => ({ ...option, disabled: depth >= CMS_MODEL_MAX_DEPTH && structuredTypes.has(option.value) }));
  return <>
    <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
      <Form.Input field={`${field}.name`} label="字段标识" placeholder="小写字母，如 venue" maxLength={50} rules={[{ required: true, message: '请输入字段标识' }, { pattern: /^[a-z][a-z0-9_]*$/, message: '使用小写字母、数字与下划线' }]} />
      <Form.Input field={`${field}.label`} label="字段名称" maxLength={100} rules={[{ required: true, message: '请输入字段名称' }]} />
      <Form.Select field={`${field}.fieldType`} label="字段类型" optionList={availableTypes}
        onChange={(next) => {
          if (next !== type) api.setValue(field, { ...definition, fieldType: next, defaultValue: undefined, optionsText: undefined, options: null, resolvedOptions: undefined, optionSource: 'manual', dictCode: null, configuration: {} });
        }} />
      <Form.Input field={`${field}.placeholder`} label="提示文案" maxLength={200} />
      {root && <Form.Input field={`${field}.detailGroup`} label="详情分组" maxLength={50} placeholder="如 活动信息" />}
    </div>
    <FieldOptionSource field={field} />
    <ModelFieldRules field={field} siblingsPath={siblingsPath} siteId={siteId} depth={depth} />
    <Space wrap spacing={12}>
      <Form.Checkbox field={`${field}.required`} noLabel>发布必填</Form.Checkbox>
      <Form.Checkbox field={`${field}.searchable`} noLabel>检索</Form.Checkbox>
      {root && <><Form.Checkbox field={`${field}.showInList`} noLabel>列表显示</Form.Checkbox><Form.Checkbox field={`${field}.showInDetail`} noLabel>详情展示</Form.Checkbox></>}
      <Form.Checkbox field={`${field}.configuration.unique`} noLabel>站内唯一</Form.Checkbox>
    </Space>
    {definition?.name && <Space spacing={4}>
      <Button theme="borderless" onClick={() => { setDefaultEditorMounted(true); setShowDefault((visible) => !visible); }}>{showDefault ? '收起默认值' : '编辑默认值'}</Button>
      {definition.defaultValue !== undefined && definition.defaultValue !== null && <Button theme="borderless" onClick={() => api.setValue(`${field}.defaultValue`, undefined)}>清除默认值</Button>}
    </Space>}
    {definition?.name && defaultEditorMounted && <div hidden={!showDefault}><Form.Section text="新建时默认值（可留空）">
      <CmsModelFieldControl key={type} field={{ ...definition, resolvedOptions: definition.optionSource === 'dict' ? dictionary.options : undefined, options: parseOptions(definition) }} common={{ field: `${field}.defaultValue`, label: '默认值' }} siteId={siteId} depth={depth} />
    </Form.Section></div>}
  </>;
}

function parseOptions(field: CmsFieldEditorValue) {
  return field.optionsText === undefined ? field.options : field.optionsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const delimiter = line.indexOf('|'); const value = delimiter < 0 ? line : line.slice(0, delimiter).trim();
    return { value, label: delimiter < 0 ? value : line.slice(delimiter + 1).trim() || value };
  });
}

function FieldOptionSource({ field }: Readonly<{ field: string }>) {
  const state = useFormState();
  const definition = getByPath(state.values, field) as CmsFieldEditorValue | undefined;
  const withOptions = CMS_FIELD_TYPES_WITH_OPTIONS.includes(definition?.fieldType as (typeof CMS_FIELD_TYPES_WITH_OPTIONS)[number]);
  const dictionaries = useDictList({ page: 1, pageSize: 200 }, withOptions);
  if (!withOptions) return null;
  return <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
    <Form.Select field={`${field}.optionSource`} label="选项来源" optionList={optionSources} />
    {definition?.optionSource === 'dict'
      ? <Form.Select field={`${field}.dictCode`} label="系统字典" filter optionList={(dictionaries.data?.list ?? []).map((dict) => ({ value: dict.code, label: `${dict.name}（${dict.code}）` }))} rules={[{ required: true, message: '请选择字典' }]} />
      : <Form.TextArea field={`${field}.optionsText`} label="选项" autosize={{ minRows: 2, maxRows: 6 }} placeholder="每行一个：值|名称" rules={[{ required: true, message: '请配置选项' }]} />}
  </div>;
}

/** Frozen component versions are explicit; a newer component never silently updates this model. */
function ComponentVersionPicker({ field, fieldsPath, siteId }: Readonly<{ field: string; fieldsPath: string; siteId?: number }>) {
  const api = useFormApi();
  const state = useFormState();
  const versionId = getByPath(state.values, field) as number | undefined;
  const components = useAllCmsComponents(siteId);
  const [selection, setSelection] = useState<{ componentId: number; versionId: number }>();
  const componentId = selection && selection.versionId === versionId ? selection.componentId : components.data?.find((component) => component.publishedVersionId === versionId)?.id;
  const versions = useCmsComponentVersions(componentId, siteId);
  return <Space vertical align="start" style={{ width: '100%', marginBottom: 12 }}>
    <Typography.Text strong>复用组件版本</Typography.Text>
    <Space wrap>
      <Select placeholder="选择已发布组件" value={componentId} style={{ minWidth: 180 }} loading={components.isFetching}
        optionList={(components.data ?? []).map((component) => ({ value: component.id, label: component.name }))}
        onChange={(next) => {
          const component = components.data?.find((item) => item.id === next);
          if (component?.publishedVersionId) { setSelection({ componentId: component.id, versionId: component.publishedVersionId }); api.setValue(field, component.publishedVersionId); api.setValue(fieldsPath, toCmsFieldEditorValues(component.fields)); }
        }} />
      {componentId && <Select value={versionId} placeholder="选择固定版本" loading={versions.isFetching} style={{ minWidth: 160 }} optionList={(versions.data ?? []).map((version) => ({ value: version.id, label: `版本 ${version.version}` }))}
        onChange={(next) => { const version = versions.data?.find((item) => item.id === next); if (version) { setSelection({ componentId: version.componentId, versionId: version.id }); api.setValue(field, version.id); api.setValue(fieldsPath, toCmsFieldEditorValues(version.fields)); } }} />}
      {versionId && <><Typography.Text type="tertiary">已固定版本 #{versionId}</Typography.Text><Button onClick={() => { api.setValue(field, undefined); setSelection(undefined); }}>转为本地字段</Button></>}
    </Space>
    {versionId && <Typography.Text size="small" type="tertiary">{((getByPath(state.values, fieldsPath) ?? []) as CmsNestedFieldDefinition[]).map((child) => child.label).join('、') || '无字段'}。更新组件后需在此明确选择新版本。</Typography.Text>}
  </Space>;
}

export default function ModelFieldRules({ field, siteId, siblingsPath = 'fields', depth = 1 }: Readonly<{ field: string; siteId?: number; siblingsPath?: string; depth?: number }>) {
  const state = useFormState();
  const definition = getByPath(state.values, field) as CmsFieldDefinition | undefined;
  const type = definition?.fieldType ?? 'text';
  const models = useAllCmsModels(siteId, siteId !== undefined && (type === 'reference' || type === 'references'));
  const siblings = (getByPath(state.values, siblingsPath) ?? []) as CmsFieldDefinition[];
  const condition = definition?.configuration?.requiredWhen;
  const requiredType = siblings.find((sibling) => sibling.name === condition?.field)?.fieldType;
  const isSequence = type === 'array' || type === 'blocks';
  return <>
    <div className="auto-grid" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
      {type === 'number' && <><Form.InputNumber field={`${field}.configuration.min`} label="最小值" /><Form.InputNumber field={`${field}.configuration.max`} label="最大值" /></>}
      {(isSequence || ['text', 'textarea', 'richtext', 'url'].includes(type)) && <>
        <Form.InputNumber field={`${field}.configuration.minLength`} label={isSequence ? '最少组件数' : '最小长度'} min={0} />
        <Form.InputNumber field={`${field}.configuration.maxLength`} label={isSequence ? '最多组件数' : '最大长度'} min={1} />
      </>}
      <Form.Select field={`${field}.configuration.requiredWhen.field`} label="条件必填" showClear placeholder="选择同级字段" optionList={siblings.filter((sibling) => sibling.name && sibling.name !== definition?.name && ['text', 'textarea', 'number', 'switch', 'select', 'radio'].includes(sibling.fieldType)).map((sibling) => ({ value: sibling.name, label: sibling.label || sibling.name }))} />
      {condition?.field && (requiredType === 'number' ? <Form.InputNumber field={`${field}.configuration.requiredWhen.equals`} label="等于" />
        : requiredType === 'switch' ? <Form.Switch field={`${field}.configuration.requiredWhen.equals`} label="等于" initValue={false} />
          : <Form.Input field={`${field}.configuration.requiredWhen.equals`} label="等于" />)}
    </div>
    {(type === 'reference' || type === 'references') && <Form.Select field={`${field}.configuration.referenceModelIds`} label="允许引用的模型" multiple showClear optionList={(models.data ?? []).map((model) => ({ value: model.id, label: model.name }))} extraText="留空允许本站全部模型；跨站引用不可用" />}
    {(type === 'object' || type === 'array') && <>
      <ComponentVersionPicker field={`${field}.configuration.componentVersionId`} fieldsPath={`${field}.configuration.fields`} siteId={siteId} />
      <div hidden={!!definition?.configuration?.componentVersionId}><CmsFieldDefinitionsEditor field={`${field}.configuration.fields`} siteId={siteId} depth={depth + 1} /></div>
    </>}
    {type === 'blocks' && <ArrayField field={`${field}.configuration.blockTypes`}>{({ arrayFields, addWithInitValue }) => <Space vertical align="start" style={{ width: '100%' }}>
      {arrayFields.map(({ field: block, key, remove }) => <div key={key} style={{ width: '100%', padding: 12, background: 'var(--surface-card)', borderRadius: 'var(--semi-border-radius-medium)' }}>
        <Space wrap><Form.Input field={`${block}.code`} label="区块标识" maxLength={50} rules={[{ required: true }, { pattern: /^[a-z][a-z0-9_]*$/, message: '使用小写字母、数字与下划线' }]} />
          <Form.Input field={`${block}.label`} label="区块名称" maxLength={100} rules={[{ required: true }]} /><Button type="danger" theme="borderless" onClick={remove}>删除区块</Button></Space>
        <ComponentVersionPicker field={`${block}.componentVersionId`} fieldsPath={`${block}.fields`} siteId={siteId} />
        <div hidden={!!getByPath(state.values, `${block}.componentVersionId`)}><CmsFieldDefinitionsEditor field={`${block}.fields`} siteId={siteId} depth={depth + 1} /></div>
      </div>)}
      <Button disabled={arrayFields.length >= 30 || depth >= CMS_MODEL_MAX_DEPTH} onClick={() => addWithInitValue({ id: crypto.randomUUID(), fields: [] })}>添加区块类型</Button>
    </Space>}</ArrayField>}
  </>;
}
