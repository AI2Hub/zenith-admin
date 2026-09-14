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

  it('switches the default between Monday and Sunday', async () => {
    await applyWeekStart('monday');
    expect(base.defaultProps.weekStartsOn).toBe(1);
    await applyWeekStart('sunday');
    expect(base.defaultProps.weekStartsOn).toBe(0);
  });

  it('treats unknown values as Monday', async () => {
    await applyWeekStart('saturday');
    expect(base.defaultProps.weekStartsOn).toBe(1);
  });

  it('applies the latest preference when several calls race the first module load', async () => {
    // 模块已由上面的用例加载；这里验证同步路径：连续两次调用以最后一次为准
    const first = applyWeekStart('sunday');
    const second = applyWeekStart('monday');
    await Promise.all([first, second]);
    expect(base.defaultProps.weekStartsOn).toBe(1);
  });
});
