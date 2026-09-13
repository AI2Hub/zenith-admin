/** 模拟登录发起表单值：模式用字符串承载（Semi Radio 的 value 不接受 boolean），提交时映射为 readOnly */
export interface ImpersonateFormValues {
  reason: string;
  mode: 'readonly' | 'write';
  durationMinutes: number;
  password: string;
}

export const DEFAULT_IMPERSONATE_VALUES: ImpersonateFormValues = { reason: '', mode: 'readonly', durationMinutes: 30, password: '' };
