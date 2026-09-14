import { WEEK_STARTS, type WeekStart } from '@/hooks/usePreferences';

/**
 * 一周起始日偏好：Semi 没有全局配置项，`weekStartsOn` 只能逐个 DatePicker 传入。
 * 这里改写 DatePicker 类组件的 `defaultProps.weekStartsOn`——`DatePicker` / `Form.DatePicker` / `DateRangeFilter`
 * 最终都渲染同一个类（`forwardStatics` 按引用转发静态属性），页面无需再逐处传 prop。
 * 已挂载的选择器在下一次渲染时读取新默认值。
 *
 * DatePicker 用动态 import：本模块由 PreferencesProvider 在入口静态闭包内引用，静态 import 会把 DatePicker
 * 连同 date-fns（≈240 KB / 63 KB gz）拖进登录关键路径。模块加载器按 URL 去重——这里的 import() 与后台页面
 * 静态引用的是同一个模块实例，改写对所有消费方生效；页面 chunk 与本 import 命中同一份 vendor chunk，
 * 且 React 渲染在 chunk 求值之后的调度任务里，`then` 回调必然先于任何 DatePicker 的 createElement 执行，
 * 因此仍满足「先于子树渲染生效」。
 */
const WEEK_START_DAY: Record<WeekStart, 0 | 1> = { sunday: 0, monday: 1 };

function isWeekStart(value: unknown): value is WeekStart {
  return typeof value === 'string' && WEEK_STARTS.includes(value as WeekStart);
}

type WithDefaultProps = { defaultProps?: { weekStartsOn?: number } };

let desiredDay: 0 | 1 = WEEK_START_DAY.monday;
let target: WithDefaultProps | null = null;
let loading: Promise<void> | null = null;

function writeDefault() {
  if (!target) return;
  if (!target.defaultProps) throw new Error('Semi DatePicker 不再暴露 defaultProps，一周起始日偏好需要改用其他接入方式');
  target.defaultProps.weekStartsOn = desiredDay;
}

/** 返回的 Promise 仅供测试等待；调用方无需 await（模块已加载时同步生效） */
export function applyWeekStart(pref: unknown): Promise<void> {
  desiredDay = WEEK_START_DAY[isWeekStart(pref) ? pref : 'monday'];
  if (target) {
    writeDefault();
    return Promise.resolve();
  }
  loading ??= import('@douyinfe/semi-ui/lib/es/datePicker/datePicker').then((m) => {
    target = m.default as unknown as WithDefaultProps;
    writeDefault();
  }, () => {
    // chunk 加载失败（网络中断）：放开重试，下次偏好变化再尝试
    loading = null;
  });
  return loading;
}
