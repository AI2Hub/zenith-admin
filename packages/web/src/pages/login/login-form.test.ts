/**
 * 登录页受控表单的行内校验时机：失焦校验、已触碰字段输入时实时重校验、提交全量校验。
 * 这些是原 Semi Form `rules` 的可观察行为，改为自绘表单后由本 hook 保证。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isEmail, useLoginForm, type FieldRules } from './login-form';

interface Values extends Record<string, string> {
  username: string;
  email: string;
}

const RULES: FieldRules<Values> = {
  username: [{ required: true, message: '请输入用户名' }],
  email: [
    { required: true, message: '请输入邮箱' },
    { validator: (value) => (value && !isEmail(value) ? '邮箱格式不正确' : undefined), message: '邮箱格式不正确' },
  ],
};

function mount(initial: Values = { username: '', email: '' }) {
  return renderHook(() => useLoginForm<Values>(initial, RULES));
}

describe('useLoginForm 行内校验', () => {
  it('未触碰的字段输入时不报错，失焦后才校验', () => {
    const { result } = mount();
    act(() => result.current.field('email').onChange('abc'));
    expect(result.current.errors.email).toBeUndefined();

    act(() => result.current.field('email').onBlur());
    expect(result.current.errors.email).toBe('邮箱格式不正确');
    expect(result.current.touched.email).toBe(true);
  });

  it('离开空的必填项即提示；已触碰字段随输入实时更新，合法时错误立即消失', () => {
    const { result } = mount();
    act(() => result.current.field('username').onBlur());
    expect(result.current.errors.username).toBe('请输入用户名');

    act(() => result.current.field('username').onChange('a'));
    expect(result.current.errors.username).toBeUndefined();

    act(() => result.current.field('username').onChange(''));
    expect(result.current.errors.username).toBe('请输入用户名');
  });

  it('提交全量校验并标记全部字段为已触碰；通过时返回最新值', () => {
    const { result } = mount();
    let outcome: Values | null = null;
    act(() => { outcome = result.current.validate(); });
    expect(outcome).toBeNull();
    expect(result.current.errors).toEqual({ username: '请输入用户名', email: '请输入邮箱' });
    expect(result.current.touched).toEqual({ username: true, email: true });

    act(() => {
      result.current.field('username').onChange('admin');
      result.current.field('email').onChange('admin@example.com');
    });
    expect(result.current.errors).toEqual({ username: undefined, email: undefined });
    act(() => { outcome = result.current.validate(); });
    expect(outcome).toEqual({ username: 'admin', email: 'admin@example.com' });
  });

  it('同一事件内连续输入按最新值校验，不依赖重渲染', () => {
    const { result } = mount();
    act(() => result.current.field('email').onBlur());
    act(() => {
      result.current.field('email').onChange('x@');
      result.current.field('email').onChange('x@y.io');
    });
    expect(result.current.values.email).toBe('x@y.io');
    expect(result.current.errors.email).toBeUndefined();
  });

  it('表单级错误（服务端返回的登录失败原因）在任何字段再次输入时清除', () => {
    const { result } = mount({ username: 'admin', email: 'a@b.io' });
    act(() => result.current.setFormError('用户名或密码错误'));
    expect(result.current.formError).toBe('用户名或密码错误');

    act(() => result.current.field('username').onChange('admin2'));
    expect(result.current.formError).toBeNull();
    // 失焦校验不影响表单级错误
    act(() => result.current.setFormError('账号已锁定'));
    act(() => result.current.field('email').onBlur());
    expect(result.current.formError).toBe('账号已锁定');
  });

  it('reset 清空值、错误与触碰状态', () => {
    const { result } = mount();
    act(() => {
      result.current.field('username').onBlur();
      result.current.field('username').onChange('x');
    });
    act(() => result.current.reset());
    expect(result.current.values).toEqual({ username: '', email: '' });
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
  });
});
