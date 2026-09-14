import { afterEach, describe, expect, it } from 'vitest';
import { DatePicker, Form } from '@douyinfe/semi-ui';
import BaseDatePicker from '@douyinfe/semi-ui/lib/es/datePicker/datePicker';
import { applyWeekStart } from './week-start';

type WithDefaultProps = { defaultProps: { weekStartsOn: number } };
const base = BaseDatePicker as unknown as WithDefaultProps;

afterEach(() => {
  base.defaultProps.weekStartsOn = 0;
});

describe('applyWeekStart', () => {
  it('Semi DatePicker still exposes the weekStartsOn default the preference relies on', () => {
    expect(base.defaultProps).toBeDefined();
    expect(base.defaultProps.weekStartsOn).toBe(0);
    // forwardStatics 按引用转发：公开的 DatePicker 与 Form.DatePicker 读到的是同一份 defaultProps
    expect((DatePicker as unknown as WithDefaultProps).defaultProps).toBe(base.defaultProps);
    expect(Form.DatePicker).toBeDefined();
  });

  it('switches the default between Monday and Sunday', () => {
    applyWeekStart('monday');
    expect(base.defaultProps.weekStartsOn).toBe(1);
    applyWeekStart('sunday');
    expect(base.defaultProps.weekStartsOn).toBe(0);
  });

  it('treats unknown values as Monday', () => {
    applyWeekStart('saturday');
    expect(base.defaultProps.weekStartsOn).toBe(1);
  });
});
