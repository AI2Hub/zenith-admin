/**
 * 首页「操作分布」日期切换的数据：最近 N 个自然日，按时间升序，末尾是今天。
 *
 * 与「7 天登录趋势」同起止（含今天），保证两张图说的是同一段时间。
 * 日期按本地时区生成；header 统一用「10月17日 周六」展示，避免裸 `10-17` 指代不清。
 */
import dayjs from 'dayjs';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export interface DashboardDay {
  /** `YYYY-MM-DD`，与图表数据的 `date` 字段同口径 */
  readonly date: string;
  /** 周一 / 周四等展示文案 */
  readonly weekday: string;
}

export function recentDays(count = 7): DashboardDay[] {
  return Array.from({ length: count }, (_, index) => {
    const day = dayjs().subtract(count - 1 - index, 'day');
    return {
      date: day.format('YYYY-MM-DD'),
      weekday: WEEKDAYS[day.day()],
    };
  });
}

/** `YYYY-MM-DD` → `10月17日`：空态这类没有上下文的位置用它，避免 `10-17` 让人费解 */
export function monthDayLabel(date: string): string {
  const parsed = dayjs(date);
  return parsed.isValid() ? parsed.format('M月D日') : date;
}
