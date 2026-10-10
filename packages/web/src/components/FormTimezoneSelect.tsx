import { Form } from '@douyinfe/semi-ui';
import { DEFAULT_TIMEZONE, IANA_TIMEZONE_OPTIONS } from '@/utils/timezones';

interface FormTimezoneSelectProps {
  field?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  extraText?: string;
}

export function FormTimezoneSelect({
  field = 'timezone',
  label = '时区',
  required = true,
  disabled,
  extraText,
}: Readonly<FormTimezoneSelectProps>) {
  return (
    <Form.Select
      field={field}
      label={label}
      filter
      disabled={disabled}
      showClear
      style={{ width: '100%' }}
      optionList={IANA_TIMEZONE_OPTIONS}
      placeholder={required ? '请选择时区' : `默认 ${DEFAULT_TIMEZONE}`}
      extraText={extraText ?? (required ? undefined : `留空使用 ${DEFAULT_TIMEZONE}`)}
      rules={required ? [{ required: true, message: '请选择时区' }] : undefined}
    />
  );
}
