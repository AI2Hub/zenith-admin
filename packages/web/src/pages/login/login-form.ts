import { useCallback, useState } from 'react';

/**
 * 登录页专用的轻量受控表单。
 *
 * 登录页静态打包在后台入口的关键路径里，而 Semi `Form`（含 `BaseForm`）静态引入全部字段控件
 * （DatePicker → date-fns、Upload → cropper、Cascader、TreeSelect …，minified ≈ 770 KB / 210 KB gz），
 * 用它就把整套控件拖进匿名首屏。这里用 `Input` + 本地状态实现登录场景需要的「必填 / 格式」校验，
 * 后台页面的表单仍按规范走 Semi `Form` / `EditFormModal`，不要把本文件推广到别处。
 */

export interface FieldRule<T extends Record<string, string>> {
  required?: boolean;
  pattern?: RegExp;
  validator?: (value: string, values: T) => string | undefined;
  message: string;
}

export type FieldRules<T extends Record<string, string>> = Partial<Record<keyof T & string, FieldRule<T>[]>>;

type FieldErrors<T extends Record<string, string>> = Partial<Record<keyof T & string, string>>;

function validateField<T extends Record<string, string>>(value: string, rules: FieldRule<T>[], values: T): string | undefined {
  for (const rule of rules) {
    if (rule.required && value.trim() === '') return rule.message;
    if (rule.pattern && value !== '' && !rule.pattern.test(value)) return rule.message;
    const custom = rule.validator?.(value, values);
    if (custom) return custom;
  }
  return undefined;
}

export function useLoginForm<T extends Record<string, string>>(initial: T, rules: FieldRules<T>) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FieldErrors<T>>({});

  const setValue = useCallback((field: keyof T & string, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // 用户修改后立即清掉该字段的错误，下次提交再校验
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  /** 校验全部字段：通过返回当前值，否则写入错误并返回 null */
  const validate = useCallback((): T | null => {
    const next: FieldErrors<T> = {};
    for (const field of Object.keys(rules) as (keyof T & string)[]) {
      const message = validateField(values[field] ?? '', rules[field] ?? [], values);
      if (message) next[field] = message;
    }
    setErrors(next);
    return Object.keys(next).length === 0 ? values : null;
  }, [rules, values]);

  const reset = useCallback(() => {
    setValues(initial);
    setErrors({});
  }, [initial]);

  /** 展开到 `LoginField`：`{...form.field('username')}` */
  const field = useCallback((name: keyof T & string) => ({
    value: values[name] ?? '',
    onChange: (value: string) => setValue(name, value),
    error: errors[name],
  }), [values, errors, setValue]);

  return { values, errors, setValue, validate, reset, field };
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
