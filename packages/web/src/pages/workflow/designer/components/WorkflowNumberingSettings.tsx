import { Banner, Form, Select, Typography } from '@douyinfe/semi-ui';
import { useId } from 'react';
import type { NumberingBindingRef } from '@zenith/shared/platform';
import { isWorkflowNumberingParameterField, validateWorkflowNumberingMapping, type WorkflowFormField } from '@zenith/shared/workflow';
import { useNumberingRuleOptions } from '@/hooks/queries/numbering';
import { flattenFields } from './form-renderer/field-utils';

interface WorkflowNumberingSettingsProps {
  value?: NumberingBindingRef;
  formFields: WorkflowFormField[];
  readOnly: boolean;
  onChange: (value: NumberingBindingRef | undefined) => void;
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
  const fieldOptions = flattenFields(formFields).filter(field => field.key && isWorkflowNumberingParameterField(field)
    && validateWorkflowNumberingMapping({ categoryCode: `formData.${field.key}` }, formFields).length === 0)
    .map(field => ({ value: `formData.${field.key}`, label: `${field.label || field.key}（${field.key}）` }));
  const mappingErrors = validateWorkflowNumberingMapping(value?.parameterMapping ?? {}, formFields);
  return (
    <>
      <Form.Slot label={<span id={`${labelId}-rule`}>流程编号规则</span>}>
        <Select aria-labelledby={`${labelId}-rule`} value={value?.versionId} disabled={readOnly} loading={rules.isFetching} showClear filter
          style={{ width: '100%' }} optionList={options} placeholder="使用编号中心的默认业务绑定"
          onChange={versionId => {
            if (typeof versionId !== 'number') { onChange(undefined); return; }
            const option = rules.data?.find(rule => rule.versionId === versionId);
            if (!option) return;
            onChange({ ruleId: option.id, versionId: option.versionId, parameterMapping: Object.fromEntries(Object.entries(value?.parameterMapping ?? {}).filter(([key]) => option.requiredParameters.includes(key))) });
          }} />
      </Form.Slot>
      <Form.Slot>
        <Typography.Paragraph type="tertiary" size="small">流程发布时固定编号版本。保存草稿不取号，首次正式提交生成，同一实例重提保留原编号。</Typography.Paragraph>
        {selected && <Typography.Paragraph type="tertiary" size="small">编号模板：{selected.template}</Typography.Paragraph>}
        {!value && <Typography.Paragraph type="tertiary" size="small">发布时采用该流程在编号中心配置的默认绑定；发布后不会自动切换到新版本。</Typography.Paragraph>}
        {fixedOlderVersion && !rules.isFetching && <Banner type="info" closeIcon={null} description="已保留原先固定的编号版本。需要升级时，请显式选择当前已发布版本后重新发布流程。" />}
        {rules.isError && <Banner type="warning" closeIcon={null} description="编号规则加载失败，可重新进入此设置页重试。已保存的版本引用不会被清空。" />}
      </Form.Slot>
      {parameters.map(parameter => (
        <Form.Slot key={parameter} label={<span id={`${labelId}-${parameter}`}>{parameter === 'categoryCode' ? '编号业务分类字段' : parameter}</span>}>
          <Select aria-labelledby={`${labelId}-${parameter}`} value={value?.parameterMapping[parameter]} disabled={readOnly} style={{ width: '100%' }} optionList={fieldOptions}
            placeholder={fieldOptions.length ? '选择提供分类编码的表单字段' : '请先添加文本、数字、单选或日期字段'}
            onChange={source => { if (value && typeof source === 'string') onChange({ ...value, parameterMapping: { ...value.parameterMapping, [parameter]: source } }); }} />
          {!value?.parameterMapping[parameter] && <Typography.Text type="warning" size="small">发布前需要选择对应字段。</Typography.Text>}
        </Form.Slot>
      ))}
      {mappingErrors.length > 0 && <Form.Slot><Banner type="warning" closeIcon={null} description={mappingErrors.join('；')} /></Form.Slot>}
      {parameters.length > 0 && <Form.Slot><Typography.Text type="tertiary" size="small">租户、部门和发起人身份由系统提供；这里仅映射业务分类字段。</Typography.Text></Form.Slot>}
    </>
  );
}
