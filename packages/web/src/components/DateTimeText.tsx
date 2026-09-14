import type { ReactNode } from 'react';
import { Tooltip } from '@douyinfe/semi-ui';
import { useOptionalPreferences, type TimeDisplay } from '@/hooks/usePreferences';
import { useNowTick } from '@/hooks/useNowTick';
import { formatDateTime, formatRelativeTime } from '@/utils/date';
import { EMPTY_PLACEHOLDER } from '@/utils/empty-placeholder';

type DateTimeValue = Date | string | number | null | undefined;

export interface DateTimeTextProps {
  readonly value: DateTimeValue;
  /** 空值占位；默认 `—` */
  readonly empty?: ReactNode;
  /**
   * 展示方式。缺省跟随偏好「时间显示方式」；时间本身是查看对象（详情字段、精确时刻）时传 `absolute` 固定为绝对时间，
   * 看板类始终相对时传 `relative`
   */
  readonly mode?: TimeDisplay;
  readonly className?: string;
}

function RelativeDateTime({ value, className }: Readonly<{ value: Date | string | number; className?: string }>) {
  const now = useNowTick();
  const absolute = formatDateTime(value);
  return (
    <Tooltip content={absolute} position="top">
      <span className={className}>{formatRelativeTime(value, now) || absolute}</span>
    </Tooltip>
  );
}

/**
 * 时间元信息的统一展示：列表时间列、消息 / 公告 / 评论 / 通知条目与审批流转记录的时间戳都经它渲染，
 * 绝对 / 相对两种形态由偏好决定，相对形态悬停显示精确时刻并每 30 秒刷新。
 * `formatDateTime()` 只用于数据语义（导出文件名、拼接文本、表单值）。
 */
export default function DateTimeText({ value, empty = EMPTY_PLACEHOLDER, mode, className }: DateTimeTextProps) {
  const preferred = useOptionalPreferences()?.preferences.timeDisplay ?? 'absolute';
  if (value === null || value === undefined || value === '') return <>{empty}</>;
  const effective = mode ?? preferred;
  if (effective === 'relative') return <RelativeDateTime value={value} className={className} />;
  const text = formatDateTime(value);
  return className ? <span className={className}>{text}</span> : <>{text}</>;
}
