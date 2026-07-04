// ─── 校验规则设置（长度/范围/正则/唯一/跨字段比较，拆分自 FieldConfigPanel.tsx）───
import { Input, InputNumber, Switch, Typography } from '@douyinfe/semi-ui';
import type { WorkflowFormField } from '@zenith/shared';
import { regexError } from './helpers';
import type { FieldTypeFlags } from './field-type-flags';
import { CompareRulesEditor } from './CompareRulesEditor';

interface ValidationSectionProps {
  field: WorkflowFormField;
  conditionFields: WorkflowFormField[];
  flags: FieldTypeFlags;
  onChange: (updates: Partial<WorkflowFormField>) => void;
}

export function ValidationSection({ field, conditionFields, flags, onChange }: Readonly<ValidationSectionProps>) {
  const { isText, isFormatted, isAmountOrNumber, supportsUnique, supportsCompare } = flags;
  const patternError = regexError(field.pattern);
  const textRangeError = field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength
    ? '最小长度不能大于最大长度'
    : null;
  const numberRangeError = field.min !== undefined && field.max !== undefined && field.min > field.max
    ? '最小值不能大于最大值'
    : null;

  return (
        <div className="fd-form-config__section">
          {(isText || isFormatted) && (
            <>
              <div className="fd-form-config__field">
                <Typography.Text strong size="small">最小长度</Typography.Text>
                <InputNumber
                  value={field.minLength}
                  onChange={(v) => onChange({ minLength: v === undefined || v === '' ? undefined : Number(v) })}
                  min={0}
                  placeholder="不限"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="fd-form-config__field">
                <Typography.Text strong size="small">最大长度</Typography.Text>
                <InputNumber
                  value={field.maxLength}
                  onChange={(v) => onChange({ maxLength: v === undefined || v === '' ? undefined : Number(v) })}
                  min={1}
                  placeholder="不限"
                  style={{ width: '100%' }}
                />
              </div>
              {textRangeError && (
                <Typography.Text type="danger" size="small" style={{ display: 'block', marginBottom: 12 }}>
                  {textRangeError}
                </Typography.Text>
              )}
            </>
          )}
          {isAmountOrNumber && (
            <>
              <div className="fd-form-config__field">
                <Typography.Text strong size="small">最小值</Typography.Text>
                <InputNumber
                  value={field.min}
                  onChange={(v) => onChange({ min: v === undefined || v === '' ? undefined : Number(v) })}
                  placeholder="不限"
                  style={{ width: '100%' }}
                />
              </div>
              <div className="fd-form-config__field">
                <Typography.Text strong size="small">最大值</Typography.Text>
                <InputNumber
                  value={field.max}
                  onChange={(v) => onChange({ max: v === undefined || v === '' ? undefined : Number(v) })}
                  placeholder="不限"
                  style={{ width: '100%' }}
                />
              </div>
              {numberRangeError && (
                <Typography.Text type="danger" size="small" style={{ display: 'block', marginBottom: 12 }}>
                  {numberRangeError}
                </Typography.Text>
              )}
            </>
          )}
          {/* 正则校验（仅 text 类型显式可配；格式化控件已内置） */}
          {isText && (
            <>
              <div className="fd-form-config__field">
                <Typography.Text strong size="small">正则表达式</Typography.Text>
                <Input
                  value={field.pattern ?? ''}
                  onChange={(v) => onChange({ pattern: v || undefined })}
                  placeholder="如 ^[A-Z0-9]+$"
                />
                {patternError && (
                  <Typography.Text type="danger" size="small" style={{ display: 'block', marginTop: 4 }}>
                    {patternError}
                  </Typography.Text>
                )}
              </div>
              <div className="fd-form-config__field">
                <Typography.Text strong size="small">校验失败提示</Typography.Text>
                <Input
                  value={field.patternMessage ?? ''}
                  onChange={(v) => onChange({ patternMessage: v || undefined })}
                  placeholder="如：仅允许大写字母和数字"
                />
              </div>
            </>
          )}
          {isFormatted && (
            <Typography.Text type="tertiary" size="small">
              该控件已内置格式校验，无需配置正则。
            </Typography.Text>
          )}

          {/* 唯一性校验 */}
          {supportsUnique && (
            <div className="fd-form-config__field fd-form-config__field--inline" style={{ marginTop: 12 }}>
              <div>
                <Typography.Text strong size="small">禁止重复</Typography.Text>
                <Typography.Text type="tertiary" size="small" style={{ display: 'block' }}>
                  用于明细表内该列值不可重复
                </Typography.Text>
              </div>
              <Switch
                size="small"
                checked={field.unique ?? false}
                onChange={(v) => onChange({ unique: v || undefined })}
              />
            </div>
          )}

          {/* 跨字段比较校验 */}
          {supportsCompare && (
            <div className="fd-form-config__field" style={{ marginTop: 12 }}>
              <Typography.Text strong size="small">字段比较校验</Typography.Text>
              <CompareRulesEditor
                field={field}
                candidates={conditionFields}
                onChange={onChange}
              />
            </div>
          )}
        </div>
  );
}
