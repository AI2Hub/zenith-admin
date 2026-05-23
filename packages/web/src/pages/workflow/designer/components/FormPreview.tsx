/**
 * 表单预览组件 — 在 Modal 中渲染真实表单控件预览
 */
import { useRef } from 'react';
import { Modal, Form, Select, Upload, Button, Tag, Typography, Row, Col, Divider, Rating } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { Plus } from 'lucide-react';
import type { WorkflowFormField, WorkflowFormFieldColumn } from '@zenith/shared';
import { CURRENCY_OPTIONS } from '../form-types';

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const EMAIL_REGEX = /^[\w.+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ID_CARD_REGEX = /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[0-9Xx]$/;
const URL_REGEX = /^https?:\/\/.+/;
const SAFE_EXPR_REGEX = /^[\d+\-*/(). ]+$/;

const getColumnKey = (parentKey: string, column: WorkflowFormFieldColumn) =>
  `${parentKey}-col-${column.span}-${column.fields.map(field => field.key).join('-') || 'empty'}`;

/** 收集所有叶子字段（递归展开 row/group/detail children） */
function flattenFields(fields: WorkflowFormField[]): WorkflowFormField[] {
  const out: WorkflowFormField[] = [];
  for (const f of fields) {
    out.push(f);
    if (f.type === 'row' && f.columns) {
      for (const col of f.columns) out.push(...flattenFields(col.fields));
    } else if ((f.type === 'group' || f.type === 'detail') && f.children) {
      out.push(...flattenFields(f.children));
    }
  }
  return out;
}

/** 安全计算公式：替换 {key} 为数值后用白名单字符集校验执行 */
function evalFormula(formula: string, values: Record<string, unknown>, precision = 2): number | null {
  const replaced = formula.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = values[key.trim()];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? String(n) : '0';
  });
  if (!SAFE_EXPR_REGEX.test(replaced)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${replaced});`)() as number;
    if (!Number.isFinite(result)) return null;
    return Number(result.toFixed(precision));
  } catch {
    return null;
  }
}

interface FormPreviewProps {
  visible: boolean;
  fields: WorkflowFormField[];
  onClose: () => void;
}

export default function FormPreview({ visible, fields, onClose }: Readonly<FormPreviewProps>) {
  const formApiRef = useRef<FormApi | null>(null);
  const formulaFields = flattenFields(fields).filter(f => f.type === 'formula' && f.formula);

  const handleValueChange = (values: Record<string, unknown>) => {
    if (!formApiRef.current || formulaFields.length === 0) return;
    for (const f of formulaFields) {
      if (!f.formula) continue;
      const result = evalFormula(f.formula, values, f.precision ?? 2);
      const display = result === null ? '当前不可计算' : `${result}${f.unit ?? ''}`;
      if (values[f.key] !== display) {
        formApiRef.current.setValue(f.key, display);
      }
    }
  };

  return (
    <Modal
      title="表单预览"
      visible={visible}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>关闭</Button>
      }
      width={560}
      bodyStyle={{ maxHeight: '65vh', overflowY: 'auto' }}
    >
      {fields.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--semi-color-text-2)', padding: '40px 0' }}>
          暂无表单字段
        </div>
      ) : (
        <Form
          labelPosition="top"
          style={{ padding: '0 8px' }}
          getFormApi={(api) => { formApiRef.current = api; }}
          onValueChange={handleValueChange}
        >
          {fields.map(field => (
            <PreviewField key={field.key} field={field} />
          ))}
        </Form>
      )}
    </Modal>
  );
}

function PreviewField({ field }: Readonly<{ field: WorkflowFormField }>) {
  const baseRules: Array<Record<string, unknown>> = [];
  if (field.required) baseRules.push({ required: true, message: `请填写${field.label}` });
  if (field.minLength !== undefined) baseRules.push({ type: 'string', minLength: field.minLength, message: `最少${field.minLength}个字符` });
  if (field.maxLength !== undefined) baseRules.push({ type: 'string', maxLength: field.maxLength, message: `最多${field.maxLength}个字符` });
  if (field.pattern) {
    try {
      baseRules.push({ pattern: new RegExp(field.pattern), message: field.patternMessage ?? '格式不正确' });
    } catch { /* invalid regex */ }
  }
  const numberRules: Array<Record<string, unknown>> = [];
  if (field.required) numberRules.push({ required: true, message: `请填写${field.label}` });
  if (field.min !== undefined) numberRules.push({ type: 'number', min: field.min, message: `不小于${field.min}` });
  if (field.max !== undefined) numberRules.push({ type: 'number', max: field.max, message: `不大于${field.max}` });
  const rules = baseRules.length > 0 ? baseRules : undefined;
  const helpText = field.helpText;
  const extraProps = helpText ? { extraText: helpText } : {};
  const unitSuffix = field.unit ? `（${field.unit}）` : '';
  const numberLabel = `${field.label}${unitSuffix}`;

  switch (field.type) {
    case 'text':
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? `请输入${field.label}`}
          initValue={field.defaultValue}
          rules={rules}
          {...extraProps}
        />
      );

    case 'textarea':
      return (
        <Form.TextArea
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? `请输入${field.label}`}
          autosize={{ minRows: 2, maxRows: 6 }}
          initValue={field.defaultValue}
          rules={rules}
          {...extraProps}
        />
      );

    case 'phone':
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? '请输入手机号'}
          initValue={field.defaultValue}
          rules={[
            ...(field.required ? [{ required: true, message: `请填写${field.label}` }] : []),
            { pattern: PHONE_REGEX, message: '手机号格式不正确' },
          ]}
          {...extraProps}
        />
      );

    case 'email':
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? '请输入邮箱'}
          initValue={field.defaultValue}
          rules={[
            ...(field.required ? [{ required: true, message: `请填写${field.label}` }] : []),
            { pattern: EMAIL_REGEX, message: '邮箱格式不正确' },
          ]}
          {...extraProps}
        />
      );

    case 'idCard':
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? '请输入身份证号'}
          initValue={field.defaultValue}
          rules={[
            ...(field.required ? [{ required: true, message: `请填写${field.label}` }] : []),
            { pattern: ID_CARD_REGEX, message: '身份证号格式不正确' },
          ]}
          maxLength={18}
          {...extraProps}
        />
      );

    case 'url':
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? '请输入网址'}
          initValue={field.defaultValue}
          rules={[
            ...(field.required ? [{ required: true, message: `请填写${field.label}` }] : []),
            { pattern: URL_REGEX, message: '网址需以 http:// 或 https:// 开头' },
          ]}
          {...extraProps}
        />
      );

    case 'rate':
      return (
        <Form.Slot label={field.label} {...extraProps}>
          <Rating count={field.rateMax ?? 5} defaultValue={Number(field.defaultValue) || 0} />
        </Form.Slot>
      );

    case 'formula':
      return (
        <Form.Input
          field={field.key}
          label={numberLabel}
          disabled
          initValue="请填写依赖字段后自动计算"
          extraText={field.formula ? `公式：${field.formula}` : helpText}
        />
      );

    case 'number':
      return (
        <Form.InputNumber
          field={field.key}
          label={numberLabel}
          placeholder={field.placeholder ?? `请输入${field.label}`}
          precision={field.precision}
          step={field.step}
          min={field.min}
          max={field.max}
          initValue={field.defaultValue}
          style={{ width: '100%' }}
          rules={numberRules.length > 0 ? numberRules : undefined}
          {...extraProps}
        />
      );

    case 'amount': {
      const currencyLabel = CURRENCY_OPTIONS.find(c => c.value === (field.currency ?? 'CNY'))?.label ?? 'CNY';
      const amountSuffix = field.unit ? ` · ${field.unit}` : '';
      const amountLabel = `${field.label}（${currencyLabel}${amountSuffix}）`;
      return (
        <Form.InputNumber
          field={field.key}
          label={amountLabel}
          placeholder={field.placeholder ?? `请输入${field.label}`}
          precision={field.precision ?? 2}
          min={field.min}
          max={field.max}
          initValue={field.defaultValue}
          style={{ width: '100%' }}
          prefix="¥"
          rules={numberRules.length > 0 ? numberRules : undefined}
          {...extraProps}
        />
      );
    }

    case 'date':
      return (
        <Form.DatePicker
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? `请选择${field.label}`}
          style={{ width: '100%' }}
          format={field.dateFormat ?? 'yyyy-MM-dd'}
          rules={rules}
        />
      );

    case 'dateRange':
      return (
        <Form.DatePicker
          field={field.key}
          label={field.label}
          type="dateRange"
          style={{ width: '100%' }}
          format={field.dateFormat ?? 'yyyy-MM-dd'}
          rules={rules}
        />
      );

    case 'select':
      return (
        <Form.Select
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? `请选择${field.label}`}
          style={{ width: '100%' }}
          rules={rules}
        >
          {(field.options ?? []).map(opt => (
            <Select.Option key={opt} value={opt}>{opt}</Select.Option>
          ))}
        </Form.Select>
      );

    case 'multiSelect':
      return (
        <Form.Select
          field={field.key}
          label={field.label}
          placeholder={field.placeholder ?? `请选择${field.label}`}
          multiple
          style={{ width: '100%' }}
          rules={rules}
        >
          {(field.options ?? []).map(opt => (
            <Select.Option key={opt} value={opt}>{opt}</Select.Option>
          ))}
        </Form.Select>
      );

    case 'attachment':
    case 'image':
      return (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
            {field.label}{field.required && <span style={{ color: 'var(--semi-color-danger)' }}> *</span>}
          </Typography.Text>
          <Upload action="" listType={field.type === 'image' ? 'picture' : 'list'} limit={field.maxCount ?? 5}>
            <Button icon={<Plus size={14} />} theme="light">
              {field.type === 'image' ? '上传图片' : '上传文件'}
            </Button>
          </Upload>
          {field.maxCount && (
            <Typography.Text type="tertiary" size="small">
              最多上传 {field.maxCount} 个文件
            </Typography.Text>
          )}
        </div>
      );

    case 'contact':
      return (
        <Form.Select
          field={field.key}
          label={field.label}
          placeholder="请选择联系人"
          style={{ width: '100%' }}
          rules={rules}
          disabled
        >
          <Select.Option value="demo">（联系人选择器）</Select.Option>
        </Form.Select>
      );

    case 'department':
      return (
        <Form.Select
          field={field.key}
          label={field.label}
          placeholder="请选择部门"
          style={{ width: '100%' }}
          rules={rules}
          disabled
        >
          <Select.Option value="demo">（部门选择器）</Select.Option>
        </Form.Select>
      );

    case 'description':
      return (
        <div style={{ marginBottom: 16, padding: '12px', background: 'var(--semi-color-fill-0)', borderRadius: 6 }}>
          <Typography.Text type="secondary">
            {field.description || '说明文字'}
          </Typography.Text>
        </div>
      );

    case 'serialNumber':
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          disabled
          initValue={`${field.serialPrefix ?? ''}20260101001`}
        />
      );

    case 'detail': {
      const children = field.children ?? [];
      return (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            {field.label}{field.required && <span style={{ color: 'var(--semi-color-danger)' }}> *</span>}
          </Typography.Text>
          <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 6, padding: 12, background: 'var(--semi-color-fill-0)' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {children.map(child => (
                <Tag key={child.key} color="blue" size="large">{child.label}</Tag>
              ))}
            </div>
            <Button size="small" theme="light" icon={<Plus size={12} />}>添加明细行</Button>
          </div>
        </div>
      );
    }

    case 'row':
      return (
        <Row gutter={16}>
          {(field.columns || []).map((col) => (
            <Col span={col.span} key={getColumnKey(field.key, col)}>
              {(col.fields || []).map(childField => (
                <PreviewField key={childField.key} field={childField} />
              ))}
            </Col>
          ))}
        </Row>
      );

    case 'divider':
      return <Divider style={{ margin: '16px 0' }} />;

    case 'group':
      return (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--semi-color-text-0)',
            borderBottom: '1px solid var(--semi-color-border)',
            paddingBottom: 8,
            marginBottom: 16,
          }}>
            {field.title || field.label}
          </div>
          {(field.children || []).map(childField => (
            <PreviewField key={childField.key} field={childField} />
          ))}
        </div>
      );

    default:
      return (
        <Form.Input
          field={field.key}
          label={field.label}
          placeholder={field.placeholder}
          rules={rules}
        />
      );
  }
}
