// ─── 显隐规则编辑器（含条件值编辑）（拆分自 FieldConfigPanel.tsx）───
import { Button, Input, InputNumber, Select, Switch, Typography, RadioGroup, Radio } from '@douyinfe/semi-ui';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowFormField, WorkflowFieldVisibilityCondition } from '@zenith/shared';
import { NO_VALUE_OPERATORS, formatVisibilityValue, operatorsForField } from './helpers';

// 根据依赖字段类型与操作符渲染合适的「值」编辑器
function ConditionValueEditor({ refField, operator, value, onChange }: Readonly<{
  refField: WorkflowFormField | undefined;
  operator: string;
  value: unknown;
  onChange: (v: unknown) => void;
}>) {
  if (NO_VALUE_OPERATORS.has(operator)) return null;
  const type = refField?.type;
  const options = refField?.options ?? [];

  if (type === 'switch') {
    return (
      <Select
        value={value === true ? 'true' : value === false ? 'false' : undefined}
        onChange={(v) => onChange(v === 'true')} style={{ width: '100%' }}
        optionList={[{ value: 'true', label: '是 / 开' }, { value: 'false', label: '否 / 关' }]}
        placeholder="选择开关状态"
      />
    );
  }
  if (type === 'number' || type === 'amount' || type === 'slider') {
    return (
      <InputNumber
        value={value as number | undefined}
        onChange={(v) => onChange(v === '' || v === undefined ? undefined : Number(v))}
        style={{ width: '100%' }} placeholder="输入数值"
      />
    );
  }
  if (options.length > 0 && (type === 'select' || type === 'radio' || type === 'multiSelect' || type === 'checkbox')) {
    if (operator === 'in') {
      const arr = Array.isArray(value)
        ? value as string[]
        : (typeof value === 'string' && value ? value.split(',').map(s => s.trim()).filter(Boolean) : []);
      return (
        <Select
          multiple value={arr} onChange={(v) => onChange(v)} style={{ width: '100%' }}
          optionList={options.map(o => ({ value: o, label: o }))}
          placeholder="选择一个或多个值"
        />
      );
    }
    return (
      <Select
        value={value as string | undefined} onChange={onChange} style={{ width: '100%' }}
        optionList={options.map(o => ({ value: o, label: o }))}
        showClear placeholder="选择值"
      />
    );
  }
  return (
    <Input
      value={formatVisibilityValue(value)}
      onChange={(v) => onChange(v)}
      placeholder="条件值（多个值用英文逗号分隔表示「包含在」）"
    />
  );
}

export function VisibilityRulesEditor({
  field,
  conditionFields,
  onChange,
  ruleKey = 'visibilityRules',
  clearLegacy = false,
  toggleLabel = '启用联动规则',
}: Readonly<{
  field: WorkflowFormField;
  conditionFields: WorkflowFormField[];
  onChange: (updates: Partial<WorkflowFormField>) => void;
  ruleKey?: 'visibilityRules' | 'requiredRules' | 'readOnlyRules';
  clearLegacy?: boolean;
  toggleLabel?: string;
}>) {
  const group = field[ruleKey];
  const enabled = !!group && (group.rules?.length ?? 0) > 0;
  const newRule = (): WorkflowFieldVisibilityCondition => ({
    field: conditionFields[0].key,
    operator: 'eq',
    value: '',
  });

  // 设置规则组（显隐规则同时清除旧版单条件，避免冲突）
  const setGroup = (logic: 'and' | 'or', rules: WorkflowFieldVisibilityCondition[]) =>
    onChange({ [ruleKey]: { logic, rules }, ...(clearLegacy ? { visibilityCondition: undefined } : {}) });

  const toggle = (v: boolean) => {
    if (v) setGroup('and', [newRule()]);
    else onChange({ [ruleKey]: undefined });
  };

  const updateRule = (index: number, patch: Partial<WorkflowFieldVisibilityCondition>) => {
    if (!group) return;
    setGroup(group.logic, group.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRule = () => {
    if (!group) return;
    setGroup(group.logic, [...group.rules, newRule()]);
  };

  const removeRule = (index: number) => {
    if (!group) return;
    const rules = group.rules.filter((_, i) => i !== index);
    if (rules.length === 0) onChange({ [ruleKey]: undefined });
    else setGroup(group.logic, rules);
  };

  return (
    <>
      <div className="fd-form-config__field fd-form-config__field--inline">
        <Typography.Text strong size="small">{toggleLabel}</Typography.Text>
        <Switch checked={enabled} onChange={toggle} size="small" />
      </div>

      {enabled && group && (
        <>
          <div className="fd-form-config__field fd-form-config__field--inline">
            <Typography.Text size="small">满足条件</Typography.Text>
            <RadioGroup
              type="button"
              value={group.logic}
              onChange={(e) => setGroup(e.target.value as 'and' | 'or', group.rules)}
            >
              <Radio value="and">全部（且）</Radio>
              <Radio value="or">任一（或）</Radio>
            </RadioGroup>
          </div>

          {group.rules.map((rule, index) => {
            const refField = conditionFields.find(f => f.key === rule.field);
            const opList = operatorsForField(refField);
            return (
            <div className="fd-form-config__visibility" key={`rule-${index}-${rule.field}`} style={{ position: 'relative' }}>
              <div className="fd-form-config__field">
                <Typography.Text size="small">当字段</Typography.Text>
                <Select
                  value={rule.field}
                  onChange={(v) => {
                    const nextField = conditionFields.find(f => f.key === v);
                    const nextOps = operatorsForField(nextField);
                    const keepOp = nextOps.some(o => o.value === rule.operator) ? rule.operator : nextOps[0].value;
                    updateRule(index, { field: v as string, operator: keepOp as WorkflowFieldVisibilityCondition['operator'], value: '' });
                  }}
                  placeholder="请选择字段"
                  style={{ width: '100%' }}
                  optionList={conditionFields.map(f => ({ value: f.key, label: f.label }))}
                />
              </div>
              <div className="fd-form-config__field">
                <Typography.Text size="small">条件</Typography.Text>
                <Select
                  value={rule.operator}
                  onChange={(v) => updateRule(index, {
                    operator: v as WorkflowFieldVisibilityCondition['operator'],
                    ...(NO_VALUE_OPERATORS.has(v as string) ? { value: '' } : {}),
                  })}
                  placeholder="请选择条件"
                  style={{ width: '100%' }}
                  optionList={opList}
                />
              </div>
              {!NO_VALUE_OPERATORS.has(rule.operator) && (
                <div className="fd-form-config__field">
                  <Typography.Text size="small">值</Typography.Text>
                  <ConditionValueEditor
                    refField={refField}
                    operator={rule.operator}
                    value={rule.value}
                    onChange={(v) => updateRule(index, { value: v })}
                  />
                </div>
              )}
              {group.rules.length > 1 && (
                <Button
                  size="small"
                  type="danger"
                  theme="borderless"
                  icon={<Trash2 size={12} />}
                  onClick={() => removeRule(index)}
                  style={{ position: 'absolute', top: 4, right: 0 }}
                />
              )}
            </div>
            );
          })}

          <Button size="small" type="tertiary" icon={<Plus size={12} />} onClick={addRule} style={{ marginTop: 4 }}>
            添加条件
          </Button>
        </>
      )}
    </>
  );
}
