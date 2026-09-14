import BaseDatePicker from '@douyinfe/semi-ui/lib/es/datePicker/datePicker';
import { WEEK_STARTS, type WeekStart } from '@/hooks/usePreferences';

/**
 * 一周起始日偏好：Semi 没有全局配置项，`weekStartsOn` 只能逐个 DatePicker 传入。
 * 这里改写 DatePicker 类组件的 `defaultProps.weekStartsOn`——`DatePicker` / `Form.DatePicker` / `DateRangeFilter`
 * 最终都渲染同一个类（`forwardStatics` 按引用转发静态属性），页面无需再逐处传 prop。
 * 已挂载的选择器在下一次渲染时读取新默认值。
 */
const WEEK_START_DAY: Record<WeekStart, 0 | 1> = { sunday: 0, monday: 1 };

function isWeekStart(value: unknown): value is WeekStart {
  return typeof value === 'string' && WEEK_STARTS.includes(value as WeekStart);
}

type WithDefaultProps = { defaultProps?: { weekStartsOn?: number } };

export function applyWeekStart(pref: unknown) {
  const day = WEEK_START_DAY[isWeekStart(pref) ? pref : 'monday'];
  const target = BaseDatePicker as unknown as WithDefaultProps;
  if (!target.defaultProps) throw new Error('Semi DatePicker 不再暴露 defaultProps，一周起始日偏好需要改用其他接入方式');
  target.defaultProps.weekStartsOn = day;
}
