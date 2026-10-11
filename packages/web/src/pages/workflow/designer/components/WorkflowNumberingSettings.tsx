import { Banner, Form, Select, Typography } from '@douyinfe/semi-ui';
import { useId } from 'react';
import type { NumberingBindingRef } from '@zenith/shared/platform';
import { isWorkflowNumberingParameterField, resolveWorkflowNumberingMapping, validateWorkflowNumberingMapping, type WorkflowFormField } from '@zenith/shared/workflow';
import { useNumberingRuleOptions } from '@/hooks/queries/numbering';
import { flattenFields } from './form-renderer/field-utils';

interface WorkflowNumberingSettingsProps {
  value?: NumberingBindingRef;
  formFields: WorkflowFormField[];
  readOnly: boolean;
  onChange: (value: NumberingBindingRef | undefined) => void;
}

/** Resolve each token independently so a missing field can be corrected without losing other automatic mappings. */
function resolveVisibleMappings(parameters: readonly string[], mapping: Readonly<Record<string, string>>, fields: readonly WorkflowFormField[]) {
  const resolved: Record<string, string> = {};
  const errors: string[] = [];
  for (const parameter of parameters) {
    try { Object.assign(resolved, resolveWorkflowNumberingMapping([parameter], Object.hasOwn(mapping, parameter) ? { [parameter]: mapping[parameter]! } : {}, fields)); }
    catch (error) { errors.push(error instanceof Error ? error.message : '编号参数映射无效'); }
  }
  return { mapping: resolved, errors };
}

/** Workflow designers only need the authenticated published-rule lookup, never rule-management privileges. */
export function WorkflowNumberingSettings({ value, formFields, readOnly, onChange }: Readonly<WorkflowNumberingSettingsProps>) {
  const labelId = useId();
  const rules = useNumberingRuleOptions('workflow.instance');
  const selected = rules.data?.find(rule => rule.id === value?.ruleId && rule.versionId === value.versionId);
  const currentRule = rules.data?.find(rule => rule.id === value?.ruleId);
  const fixedOlderVersion = !!value && !selected;
  const options = (rules.data ?? []).map(rule => ({ value: rule.versionId, label: `${rule.name} · v${rule.currentVersion}` }));
  if (value && fixedOlderVersion) options.unshift({ value: value.versionId, label: `${currentRule?.name ?? '编号规则'} · 已固定的版本` });
  const parameters = selected?.requiredParameters ?? Object.keys(value?.parameterMapping ?? {});
  const automatic = resolveVisibleMappings(parameters, value?.parameterMapping ?? {}, formFields);
  const fieldOptions = flattenFields(formFields).filter(field => field.key && isWorkflowNumberingParameterField(field)
    && validateWorkflowNumberingMapping({ categoryCode: `formData.${field.key}` }, formFields).length === 0)
    .map(field => ({ value: `formData.${field.key}`, label: `${field.label || field.key}（${field.key}）` }));
  const mappingErrors = [...new Set([...validateWorkflowNumberingMapping(value?.parameterMapping ?? {}, formFields), ...automatic.errors])];
  return (
    <>
      <Form.Slot label={<span id={`${labelId}-rule`}>流程编号规则</span>}>
        <Select aria-labelledby={`${labelId}-rule`} value={value?.versionId} disabled={readOnly} loading={rules.isFetching} showClear filter
          style={{ width: '100%' }} optionList={options} placeholder="使用该业务类型的默认编号规则"
          onChange={versionId => {
            if (typeof versionId !== 'number') { onChange(undefined); return; }
            const option = rules.data?.find(rule => rule.versionId === versionId);
            if (!option) return;
            onChange({ ruleId: option.id, versionId: option.versionId, parameterMapping: resolveVisibleMappings(option.requiredParameters, value?.parameterMapping ?? {}, formFields).mapping });
          }} />
      </Form.Slot>
      <Form.Slot>
        <Typography.Paragraph type="tertiary" size="small">流程发布时固定编号版本。保存草稿不取号，首次正式提交生成，同一实例重提保留原编号。</Typography.Paragraph>
        {selected && <Typography.Paragraph type="tertiary" size="small">编号模板：{selected.template}</Typography.Paragraph>}
        {!value && <Typography.Paragraph type="tertiary" size="small">发布时采用「流程实例」业务类型的默认编号规则，发布后不会自动切换到新版本。</Typography.Paragraph>}
        {fixedOlderVersion && !rules.isFetching && <Banner type="info" closeIcon={null} description="已保留原先固定的编号版本。需要升级时，请显式选择当前已发布版本后重新发布流程。" />}
        {rules.isError && <Banner type="warning" closeIcon={null} description="编号规则加载失败，可重新进入此设置页重试。已保存的版本引用不会被清空。" />}
      </Form.Slot>
      {parameters.map(parameter => (
        <Form.Slot key={parameter} label={<span id={`${labelId}-${parameter}`}>{parameter === 'categoryCode' ? '编号业务分类字段' : `编号表单字段 {${parameter}}`}</span>}>
          <Select aria-labelledby={`${labelId}-${parameter}`} value={automatic.mapping[parameter]} disabled={readOnly} style={{ width: '100%' }} optionList={fieldOptions}
            placeholder={fieldOptions.length ? '选择提供编号值的表单字段' : '请先添加可用于编号的表单字段'}
            onChange={source => { if (value && typeof source === 'string') onChange({ ...value, parameterMapping: { ...value.parameterMapping, ...automatic.mapping, [parameter]: source } }); }} />
          {!automatic.mapping[parameter] && <Typography.Text type="warning" size="small">发布前需要选择对应字段。</Typography.Text>}
        </Form.Slot>
      ))}
      {mappingErrors.length > 0 && <Form.Slot><Banner type="warning" closeIcon={null} description={mappingErrors.join('；')} /></Form.Slot>}
      {parameters.length > 0 && <Form.Slot><Typography.Text type="tertiary" size="small">表单占位符按字段编码或唯一名称自动匹配，发布时固定实际字段；租户、部门和发起人身份由系统提供。</Typography.Text></Form.Slot>}
    </>
  );
}
