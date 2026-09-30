import { Button, Input, InputNumber, Select, Space, Switch } from '@douyinfe/semi-ui';
import { type CmsCollectionDefinition, type CmsModelField } from '@zenith/shared/cms';
export default function CmsCollectionFilters({ value = [], onChange, fields }: Readonly<{ value?: CmsCollectionDefinition['filters']; onChange?: (value: CmsCollectionDefinition['filters']) => void; fields: CmsModelField[] }>) {
  const options = fields.filter(field => ['text', 'number', 'date', 'datetime', 'select', 'radio', 'switch'].includes(field.fieldType));
  const patch = (index: number, update: Partial<CmsCollectionDefinition['filters'][number]>) => onChange?.(value.map((row, i) => i === index ? { ...row, ...update } : row));
  return <Space vertical align="start" style={{ width: '100%' }}>
    {value.map((rule, index) => {
      const type = fields.find(field => field.name === rule.field)?.fieldType;
      return <Space key={index} wrap>
        <Select aria-label={`筛选 ${index + 1} 字段`} value={rule.field} optionList={options.map(field => ({ value: field.name, label: field.label }))} onChange={name => { const field = options.find(item => item.name === name); patch(index, { field: String(name), value: field?.fieldType === 'number' ? 0 : field?.fieldType === 'switch' ? false : '', op: 'eq' }); }} />
        <Select aria-label={`筛选 ${index + 1} 条件`} value={rule.op} optionList={[{ value: 'eq', label: '等于' }, ...(type === 'switch' ? [] : [{ value: 'gte', label: '大于等于' }, { value: 'lte', label: '小于等于' }])]} onChange={op => patch(index, { op: op as typeof rule.op })} />
        {type === 'number' ? <InputNumber aria-label={`筛选 ${index + 1} 值`} value={Number(rule.value)} onChange={next => patch(index, { value: Number(next) })} />
          : type === 'switch' ? <Switch aria-label={`筛选 ${index + 1} 值`} checked={rule.value === true} onChange={next => patch(index, { value: next })} />
            : <Input aria-label={`筛选 ${index + 1} 值`} value={String(rule.value)} placeholder={type === 'date' || type === 'datetime' ? 'YYYY-MM-DD 或完整日期时间' : '匹配值'} onChange={next => patch(index, { value: next })} />}
        <Button onClick={() => onChange?.(value.filter((_, i) => i !== index))}>移除</Button>
      </Space>;
    })}
    <Button disabled={!options.length || value.length >= 20} onClick={() => { const field = options[0]; if (field) onChange?.([...value, { field: field.name, op: 'eq', value: field.fieldType === 'number' ? 0 : field.fieldType === 'switch' ? false : '' }]); }}>添加模型字段条件</Button>
  </Space>;
}
