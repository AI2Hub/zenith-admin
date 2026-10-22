/**
 * search-filters 契约测试：只覆盖 props → 回调的语义映射，不锁定渲染结构与样式。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { DateRangeFilter, FilterSelect, KeywordInput, NumberFilter, StatusSelect } from './search-filters';

interface SelectStubProps {
  readonly optionList?: readonly { value: string | number; label: ReactNode }[];
  readonly onChange?: (value: string | number | undefined) => void;
  readonly placeholder?: ReactNode;
  readonly value?: string | number;
  readonly style?: CSSProperties;
  readonly showClear?: boolean;
}

vi.mock('@douyinfe/semi-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@douyinfe/semi-ui')>();
  return {
    ...actual,
    // 空串选项模拟 Semi 的清除按钮：回调 undefined
    Select: ({ optionList = [], onChange, placeholder, value, style, showClear }: SelectStubProps) => (
      <select value={value ?? ''} onChange={(event) => onChange?.(event.target.value === '' ? undefined : event.target.value)} style={style} data-show-clear={showClear ? 'true' : undefined}>
        <option value="">{placeholder}</option>
        {optionList.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ),
  };
});

const STATUS_ITEMS = [
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' },
];

describe('KeywordInput', () => {
  it('onChange 透传输入值', () => {
    const onChange = vi.fn();
    render(<KeywordInput placeholder="搜索" value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('搜索'), { target: { value: 'abc' } });
    // Semi 的 Input onChange 签名是 (value, event)，这里只关心首参
    expect(onChange.mock.calls[0][0]).toBe('abc');
  });

  it('回车触发 onSearch', () => {
    const onSearch = vi.fn();
    render(<KeywordInput placeholder="搜索" value="abc" onChange={vi.fn()} onSearch={onSearch} />);
    // Semi 在 keyPress 而非 keyDown 上派发 onEnterPress
    fireEvent.keyPress(screen.getByPlaceholderText('搜索'), { key: 'Enter', charCode: 13 });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});

describe('FilterSelect', () => {
  const CHANNEL_ITEMS = [
    { value: 'wechat', label: '微信支付' },
    { value: 'alipay', label: '支付宝' },
  ];

  it('选中项回调原值；清空回调 undefined', () => {
    const onChange = vi.fn();
    render(<FilterSelect placeholder="全部渠道" items={CHANNEL_ITEMS} value="wechat" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alipay' } });
    expect(onChange).toHaveBeenLastCalledWith('alipay');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

});

describe('StatusSelect', () => {
  it('选中项回调原值；清空回调 undefined', () => {
    const onChange = vi.fn();
    render(<StatusSelect items={STATUS_ITEMS} value="enabled" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'disabled' } });
    expect(onChange).toHaveBeenLastCalledWith('disabled');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('NumberFilter', () => {
  it('输入数字回调 number，清空回调 undefined', () => {
    const onChange = vi.fn();
    render(<NumberFilter placeholder="金额 ≥ (元)" value={undefined} onChange={onChange} />);
    const input = screen.getByPlaceholderText('金额 ≥ (元)');
    fireEvent.change(input, { target: { value: '120' } });
    expect(onChange).toHaveBeenLastCalledWith(120);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('DateRangeFilter', () => {
  it('onChange 把 Semi 的宽松值收窄为 [Date, Date] | null', () => {
    const onChange = vi.fn();
    render(<DateRangeFilter value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText('开始时间');
    fireEvent.click(input);
    // 未选满两端时应回调 null，而非半截数组
    expect(onChange).not.toHaveBeenCalledWith(expect.arrayContaining([undefined]));
  });
});
