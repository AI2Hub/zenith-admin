import type { ReactNode } from 'react';
import { Input } from '@douyinfe/semi-ui';
import type { InputProps } from '@douyinfe/semi-ui/lib/es/input';

/** 登录页受控字段：Input + 绝对定位的错误提示（样式见 LoginPage.css .login-field*） */
export interface LoginFieldProps extends Omit<InputProps, 'value' | 'onChange' | 'validateStatus' | 'defaultValue'> {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: ReactNode;
  /** 缺省顶部 label；弹窗表单用 `left`（对齐原 Semi Form `labelPosition="left"`） */
  labelPosition?: 'top' | 'left';
}

export function LoginField({ error, label, labelPosition = 'top', id, className, ...inputProps }: Readonly<LoginFieldProps>) {
  const classes = ['login-field', label && labelPosition === 'left' ? 'login-field-inline' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {label ? <label className="login-field-label" htmlFor={id}>{label}</label> : null}
      <div className="login-field-main">
        <Input {...inputProps} id={id} validateStatus={error ? 'error' : 'default'} aria-invalid={!!error} />
        {error ? <div className="login-field-error" role="alert">{error}</div> : null}
      </div>
    </div>
  );
}
