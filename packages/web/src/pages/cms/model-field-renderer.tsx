/** The same recursive controls serve content, site extensions and model default values. */
import { lazy, Suspense, type ReactNode } from 'react';
import { ArrayField, Banner, Button, DatePicker, Form, Select, Space, Spin, useFormApi, useFormState, withField } from '@douyinfe/semi-ui';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CMS_MODEL_MAX_DEPTH, createCmsFieldDefaultValue, normalizeCmsStructuredValues, type CmsFieldDefinition } from '@zenith/shared/cms';
import { getByPath, isPlainObject } from '@zenith/shared/core';
import { formatDateForApi, formatDateTimeForApi } from '@/utils/date';
import CmsContentReferenceInput from './CmsContentReferenceInput';
import { CmsAssetField } from './components/CmsAssetField';

const RichTextEditor = lazy(() => import('@/components/RichTextEditor'));
const FormRichText = withField((props: { value?: string; onChange?: (value: string) => void; placeholder?: string }) => <Suspense fallback={<Spin />}><RichTextEditor {...props} height={220} /></Suspense>);
const FormContentReference = withField(CmsContentReferenceInput);
const FormAsset = withField(CmsAssetField);
const FormDate = withField(({ value, onChange, withTime = false }: { value?: string; onChange?: (value?: string) => void; withTime?: boolean }) => (
  <DatePicker value={value || undefined} type={withTime ? 'dateTime' : 'date'} density="compact" style={{ width: '100%' }}
    onChange={(next) => onChange?.(next instanceof Date || typeof next === 'string' ? (withTime ? formatDateTimeForApi(next) : formatDateForApi(next)) : undefined)} />
));

export function cmsModelFieldOptions(field: CmsFieldDefinition): { label: string; value: string }[] {
  return field.resolvedOptions ?? field.options ?? [];
}

export interface CmsModelFieldCommonProps {
  field: string;
  label: string;
  placeholder?: string;
  labelWidth?: number;
  rules?: { required?: boolean; message?: string }[];
  initValue?: unknown;
}

interface CmsModelFieldControlProps {
  readonly field: CmsFieldDefinition;
  readonly common: CmsModelFieldCommonProps;
  readonly richtext?: { rows: number; placeholder?: string };
  readonly media?: ReactNode;
  readonly siteId?: number;
  readonly depth?: number;
}

export function CmsModelFieldControl({ field, common, media, siteId, depth = 1 }: CmsModelFieldControlProps) {
  const options = cmsModelFieldOptions(field);
  if (depth > CMS_MODEL_MAX_DEPTH) return <Banner type="danger" description="字段嵌套超过模型允许层数，请修正模型定义。" />;
  switch (field.fieldType) {
    case 'textarea': return <Form.TextArea {...common} rows={3} />;
    case 'richtext': return <FormRichText {...common} />;
    case 'reference': case 'references':
      return <FormContentReference {...common} siteId={siteId} multiple={field.fieldType === 'references'} modelIds={field.configuration?.referenceModelIds} />;
    case 'object':
      return <Form.Section text={common.label}><NestedFields fields={field.configuration?.fields ?? []} path={common.field} siteId={siteId} depth={depth + 1} initialValues={isPlainObject(common.initValue) ? common.initValue : undefined} /></Form.Section>;
    case 'array': case 'blocks':
      return <RepeatableField definition={field} common={common} siteId={siteId} depth={depth} />;
    case 'number': return <Form.InputNumber {...common} min={field.configuration?.min} max={field.configuration?.max} style={{ width: '100%' }} />;
    case 'date': case 'datetime': return <FormDate {...common} withTime={field.fieldType === 'datetime'} />;
    case 'select': return <Form.Select {...common} style={{ width: '100%' }} optionList={options} showClear />;
    case 'radio': return <Form.RadioGroup {...common}>{options.map((option) => <Form.Radio key={option.value} value={option.value}>{option.label}</Form.Radio>)}</Form.RadioGroup>;
    case 'checkbox': return <Form.CheckboxGroup {...common} options={options} direction="horizontal" />;
    case 'switch': return <Form.Switch {...common} />;
    case 'image': case 'file': return media ?? <FormAsset {...common} siteId={siteId} type={field.fieldType === 'image' ? 'image' : undefined} />;
    default: return <Form.Input {...common} maxLength={field.configuration?.maxLength} />;
  }
}

function NestedFields({ fields, path, siteId, depth, initialValues }: Readonly<{ fields: CmsFieldDefinition[]; path: string; siteId?: number; depth: number; initialValues?: Record<string, unknown> }>) {
  const state = useFormState();
  return <>{fields.map((child) => {
    const condition = child.configuration?.requiredWhen;
    const required = child.required || (condition && getByPath(state.values, `${path}.${condition.field}`) === condition.equals);
    return <CmsModelFieldControl key={child.id ?? child.name} field={child} depth={depth} siteId={siteId}
      common={{ field: `${path}.${child.name}`, label: required ? `${child.label}（发布必填）` : child.label, placeholder: child.placeholder ?? undefined, initValue: initialValues?.[child.name] ?? createCmsFieldDefaultValue(child) }} />;
  })}</>;
}

function RepeatableField({ definition, common, siteId, depth }: Readonly<{ definition: CmsFieldDefinition; common: CmsModelFieldCommonProps; siteId?: number; depth: number }>) {
  const api = useFormApi();
  const move = (index: number, offset: number) => {
    const items = [...(api.getValue(common.field) as Record<string, unknown>[] ?? [])];
    [items[index], items[index + offset]] = [items[index + offset], items[index]];
    api.setValue(common.field, items);
  };
  const createItem = () => {
    const block = definition.configuration?.blockTypes?.[0];
    const children = definition.fieldType === 'blocks' ? block?.fields ?? [] : definition.configuration?.fields ?? [];
    return { ...normalizeCmsStructuredValues(children, {}), _id: crypto.randomUUID(), ...(definition.fieldType === 'blocks' ? { blockType: block?.code } : {}) };
  };
  return <Form.Section text={common.label}><ArrayField field={common.field} initValue={Array.isArray(common.initValue) ? common.initValue : undefined}>
    {({ arrayFields, addWithInitValue }) => <Space vertical align="start" style={{ width: '100%' }}>
      {arrayFields.map(({ field: item, key, remove }, index) => <div key={key} style={{ width: '100%', padding: 12, border: '1px solid var(--semi-color-border)', borderRadius: 6 }}>
        <Space spacing={4}>
          <Button aria-label="上移组件" icon={<ArrowUp size={14} />} disabled={index === 0} onClick={() => move(index, -1)} />
          <Button aria-label="下移组件" icon={<ArrowDown size={14} />} disabled={index === arrayFields.length - 1} onClick={() => move(index, 1)} />
          <Button type="danger" theme="borderless" onClick={remove}>移除此组件</Button>
        </Space>
        <ComponentFields definition={definition} path={item} siteId={siteId} depth={depth + 1} />
      </div>)}
      <Button disabled={arrayFields.length >= (definition.configuration?.maxLength ?? 1000) || (definition.fieldType === 'blocks' && !definition.configuration?.blockTypes?.length)} onClick={() => addWithInitValue(createItem())}>添加组件</Button>
    </Space>}
  </ArrayField></Form.Section>;
}

function ComponentFields({ definition, path, siteId, depth }: Readonly<{ definition: CmsFieldDefinition; path: string; siteId?: number; depth: number }>) {
  const state = useFormState();
  const api = useFormApi();
  const blockType = getByPath(state.values, `${path}.blockType`) as string | undefined;
  const fields = definition.fieldType === 'blocks' ? definition.configuration?.blockTypes?.find((block) => block.code === blockType)?.fields : definition.configuration?.fields;
  return <>
    {definition.fieldType === 'blocks' && <Select value={blockType} placeholder="选择区块类型" style={{ width: '100%', marginTop: 12 }} optionList={definition.configuration?.blockTypes?.map((block) => ({ value: block.code, label: block.label }))}
      onChange={(code) => {
        const block = definition.configuration?.blockTypes?.find((item) => item.code === code);
        api.setValue(path, { ...normalizeCmsStructuredValues(block?.fields ?? [], {}), _id: getByPath(state.values, `${path}._id`) ?? crypto.randomUUID(), blockType: code });
      }} />}
    <NestedFields fields={fields ?? []} path={path} siteId={siteId} depth={depth} />
  </>;
}
