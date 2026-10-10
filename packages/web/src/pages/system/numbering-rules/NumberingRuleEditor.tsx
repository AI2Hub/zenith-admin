import { useState } from 'react';
import { Banner, Button, DatePicker, Divider, Form, Input, Radio, RadioGroup, Select, Space, Typography, useFormApi, useFormState } from '@douyinfe/semi-ui';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { createLabelOptionsFromMap } from '@zenith/shared/core';
import {
  getNumberingScene, NUMBERING_DATE_TOKENS, NUMBERING_RESET_PERIOD_OPTIONS, NUMBERING_SCENE_OPTIONS,
  NUMBERING_SCOPE_OPTIONS, numberingConfigSchema, parseNumberingTemplate, previewBusinessNumbers,
  serializeNumberingTemplate, type NumberingConfig, type NumberingSegment,
} from '@zenith/shared/platform';
import FormStatusRadioGroup from '@/components/FormStatusRadioGroup';
import { FormTimezoneSelect } from '@/components/FormTimezoneSelect';

const segmentOptions = createLabelOptionsFromMap({ literal: '固定文本', date: '日期', sequence: '流水', parameter: '业务参数' });
const dateOptions = NUMBERING_DATE_TOKENS.map(value => ({ value, label: value }));

function TemplateEditor({ value, onChange, scene }: Readonly<{ value: string; onChange: (value: string) => void; scene: string }>) {
  const [mode, setMode] = useState('segments');
  let segments: NumberingSegment[] = [];
  let error = '';
  try { segments = parseNumberingTemplate(value); } catch (cause) { error = cause instanceof Error ? cause.message : '模板无效'; }
  const definition = getNumberingScene(scene);
  const update = (next: NumberingSegment[]) => onChange(serializeNumberingTemplate(next));
  const replace = (index: number, segment: NumberingSegment) => update(segments.map((current, at) => at === index ? segment : current));
  const move = (index: number, direction: number) => {
    const next = [...segments];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    update(next);
  };
  return (
    <>
      <RadioGroup type="button" value={mode} onChange={event => setMode(event.target.value)} style={{ marginBottom: 12 }}>
        <Radio value="segments">分段配置</Radio><Radio value="template">高级模板</Radio>
      </RadioGroup>
      {mode === 'template' || error ? (
        <>
          <Input value={value} onChange={onChange} aria-label="编号模板" placeholder="QJ-{YYYYMMDD}-{SEQ}" />
          {error && <Typography.Text type="danger">{error}</Typography.Text>}
        </>
      ) : (
        <>
          {segments.map((segment, index) => (
            <div className="numbering-segment" key={index}>
              <Select value={segment.kind} aria-label={`第 ${index + 1} 段类型`} style={{ width: 110 }} optionList={segmentOptions}
                onChange={kind => {
                  if (kind === 'sequence') replace(index, { kind });
                  if (kind === 'literal') replace(index, { kind, value: '-' });
                  if (kind === 'date') replace(index, { kind, value: 'YYYYMMDD' });
                  if (kind === 'parameter') replace(index, { kind, value: definition.parameters[0]?.key ?? 'departmentCode' });
                }} />
              <div className="numbering-segment-value">
                {segment.kind === 'literal' && <Input value={segment.value} aria-label={`第 ${index + 1} 段固定文本`} onChange={text => replace(index, { ...segment, value: text.replace(/[{}]/g, '') })} />}
                {segment.kind === 'date' && <Select value={segment.value} style={{ width: '100%' }} optionList={dateOptions} aria-label={`第 ${index + 1} 段日期`} onChange={value => replace(index, { kind: 'date', value: value as typeof NUMBERING_DATE_TOKENS[number] })} />}
                {segment.kind === 'parameter' && <Select value={segment.value} style={{ width: '100%' }} optionList={definition.parameters.map(parameter => ({ value: parameter.key, label: parameter.label }))} aria-label={`第 ${index + 1} 段参数`} onChange={value => replace(index, { kind: 'parameter', value: String(value) })} />}
                {segment.kind === 'sequence' && <Typography.Text type="tertiary">使用下方流水位数</Typography.Text>}
              </div>
              <Space spacing={4}>
                <Button icon={<ArrowUp size={14} />} aria-label={`上移第 ${index + 1} 段`} disabled={index === 0} onClick={() => move(index, -1)} />
                <Button icon={<ArrowDown size={14} />} aria-label={`下移第 ${index + 1} 段`} disabled={index === segments.length - 1} onClick={() => move(index, 1)} />
                <Button icon={<Trash2 size={14} />} aria-label={`删除第 ${index + 1} 段`} type="danger" onClick={() => update(segments.filter((_, at) => at !== index))} />
              </Space>
            </div>
          ))}
          <Button icon={<Plus size={14} />} onClick={() => update([...segments, { kind: 'literal', value: '-' }])}>添加片段</Button>
        </>
      )}
      <Typography.Paragraph type="tertiary" size="small" style={{ marginTop: 8 }}>模板：{value || '尚未配置'}</Typography.Paragraph>
    </>
  );
}

function NumberingPreview({ config, scene }: Readonly<{ config?: NumberingConfig; scene: string }>) {
  const definition = getNumberingScene(scene);
  const [at, setAt] = useState(() => new Date());
  const [inputs, setInputs] = useState<Record<string, string>>({});
  let parameterKeys: string[] = [];
  try { parameterKeys = parseNumberingTemplate(config?.template ?? '').flatMap(segment => segment.kind === 'parameter' ? [segment.value] : []); }
  catch { /* 模板输入未完成时，由下方共享校验展示错误。 */ }
  const parameters = definition.parameters.filter(parameter => parameterKeys.includes(parameter.key));
  const context = Object.fromEntries(parameters.map(parameter => [parameter.key, inputs[parameter.key] ?? parameter.example]));
  let numbers: string[] = [];
  let nextNumbers: string[] = [];
  let period = '';
  let nextPeriod = '';
  let error = '';
  try {
    const parsed = numberingConfigSchema.safeParse(config);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '请完善编号设置');
    const preview = previewBusinessNumbers(parsed.data, { scene, at, context, count: 3 });
    numbers = preview.numbers;
    period = preview.periodKey;
    if (parsed.data.resetPeriod !== 'never') {
      const nextAt = new Date(at);
      const days = parsed.data.resetPeriod === 'daily' ? 1 : parsed.data.resetPeriod === 'monthly' ? 32 : 366;
      nextAt.setUTCDate(nextAt.getUTCDate() + days);
      const next = previewBusinessNumbers(parsed.data, { scene, at: nextAt, context, count: 1 });
      nextNumbers = next.numbers;
      nextPeriod = next.periodKey;
    }
  } catch (cause) { error = cause instanceof Error ? cause.message : '请完善编号设置'; }
  return (
    <aside className="numbering-preview">
      <Typography.Title heading={6}>编号示例</Typography.Title>
      <Typography.Paragraph type="tertiary" size="small">实时预览不会消耗正式号码。实际编号由业务提交时分配。</Typography.Paragraph>
      <Typography.Paragraph>预览时间</Typography.Paragraph>
      <DatePicker type="dateTime" value={at} onChange={value => { if (value instanceof Date) setAt(value); }} showClear={false} style={{ width: '100%' }} />
      {parameters.map(parameter => (
        <div key={parameter.key} style={{ marginTop: 12 }}>
          <Typography.Paragraph>{parameter.label}</Typography.Paragraph>
          <Input value={context[parameter.key]} aria-label={`预览${parameter.label}`} onChange={value => setInputs(current => ({ ...current, [parameter.key]: value }))} />
        </div>
      ))}
      <Divider margin={16} />
      {error ? <Banner type="warning" description={error} closeIcon={null} /> : (
        <>
          <Typography.Text type="tertiary">{period === 'all' ? '连续流水' : `当前周期 ${period}`}</Typography.Text>
          {numbers.map(number => <code key={number} className="numbering-preview-number">{number}</code>)}
          {nextNumbers.length > 0 && <><Divider margin={16} /><Typography.Text type="tertiary">跨周期示例 {nextPeriod}</Typography.Text>{nextNumbers.map(number => <code key={number} className="numbering-preview-number">{number}</code>)}</>}
        </>
      )}
      <Divider margin={16} />
      <Typography.Text type="tertiary" size="small">{definition.description} 最长 {definition.maxLength} 位。</Typography.Text>
    </aside>
  );
}

export function NumberingRuleEditor({ editing, sequenceLocked }: Readonly<{ editing: boolean; sequenceLocked: boolean }>) {
  const formApi = useFormApi();
  const { values = {} } = useFormState<{ scene?: string; draft?: NumberingConfig }>();
  const scene = values.scene ?? 'workflow.instance';
  const definition = getNumberingScene(scene);
  return (
    <div className="auto-grid numbering-editor-grid">
      <div>
        <Form.Input field="name" label="规则名称" rules={[{ required: true, message: '请填写规则名称' }]} maxLength={100} />
        <Form.Input field="code" label="规则编码" disabled={editing} rules={[{ required: true, message: '请填写规则编码' }]} placeholder="如 leave.default" extraText="使用小写字母、数字、点、横线或下划线" />
        <Form.Select field="scene" label="接入业务" disabled={editing} optionList={NUMBERING_SCENE_OPTIONS} style={{ width: '100%' }}
          onChange={value => {
            const next = getNumberingScene(String(value));
            if (values.draft && !next.allowedScopes.includes(values.draft.scope)) formApi.setValue('draft.scope', next.allowedScopes[0]);
          }} />
        <FormStatusRadioGroup extraText="停用后不再分配新编号，已生成的编号保持不变。" />
        <Form.TextArea field="description" label="说明" maxLength={500} rows={2} />
        <Divider align="left">编号组成</Divider>
        <Form.Input field="draft.template" noLabel fieldStyle={{ display: 'none' }} />
        <TemplateEditor value={values.draft?.template ?? ''} scene={scene} onChange={value => formApi.setValue('draft.template', value)} />
        <Divider align="left">流水设置</Divider>
        <Form.Select field="draft.scope" label="分配范围" disabled={sequenceLocked} style={{ width: '100%' }} optionList={NUMBERING_SCOPE_OPTIONS.filter(option => definition.allowedScopes.includes(option.value))} />
        <Form.Select field="draft.resetPeriod" label="重置周期" disabled={sequenceLocked} style={{ width: '100%' }} optionList={NUMBERING_RESET_PERIOD_OPTIONS} />
        <FormTimezoneSelect field="draft.timezone" disabled={sequenceLocked} extraText="日期片段与重置周期使用相同时区。" />
        <Form.Input field="draft.start" label="起始值" disabled={sequenceLocked} rules={[{ required: true }]} />
        <Form.Input field="draft.step" label="步长" disabled={sequenceLocked} rules={[{ required: true }]} />
        <Form.InputNumber field="draft.width" label="补零位数" min={1} max={32} style={{ width: '100%' }}
          onChange={width => {
            if (typeof width === 'number' && values.draft?.template) formApi.setValue('draft.template', values.draft.template.replace(/\{SEQ:\d+\}/g, `{SEQ:${width}}`));
          }} />
      </div>
      <NumberingPreview config={values.draft} scene={scene} />
    </div>
  );
}
