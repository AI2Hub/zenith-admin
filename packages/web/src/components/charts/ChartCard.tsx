import type { ReactNode } from 'react';
import { Card, Empty, Skeleton, Typography } from '@douyinfe/semi-ui';
import './chart-card.css';

const { Text } = Typography;

interface ChartCardProps {
  /** 卡片标题（加粗 14px，位于 Card 标题栏） */
  readonly title: ReactNode;
  /** 标题栏右侧的附加说明（如「平均 4.2 分」） */
  readonly extra?: ReactNode;
  /** 加载中：用骨架屏占位；默认段落骨架，需要别的形态传 `placeholder` */
  readonly loading?: boolean;
  readonly placeholder?: ReactNode;
  /** 空态：字符串 → 居中 `Empty`；元素 → 原样渲染；假值 → 不为空 */
  readonly empty?: ReactNode;
  /** 占位区高度，与图表高度一致，避免加载 / 空态时卡片跳动 */
  readonly height?: number;
  readonly children: ReactNode;
}

/**
 * 看板图表卡片：Card 标题栏 + 紧凑正文内边距 + 加载 / 空态占位，页面只写图表本身。
 *
 * @example
 * <ChartCard title="消息趋势（近 7 天）" loading={loading}>
 *   <LineChart {...spec} options={chartOptions} height={220} />
 * </ChartCard>
 * <ChartCard title="会话状态分布" loading={loading} empty={total === 0 ? '暂无会话数据' : null}>…</ChartCard>
 */
export function ChartCard({ title, extra, loading, placeholder, empty, height = 220, children }: ChartCardProps) {
  let body: ReactNode = children;
  if (loading) {
    body = placeholder ?? (
      <div className="zx-chart-card__placeholder" style={{ height }}>
        <Skeleton active loading placeholder={
          <div style={{ width: '100%', height: height - 20, padding: '12px 0' }}>
            <Skeleton.Paragraph rows={6} style={{ width: '100%' }} />
          </div>
        } />
      </div>
    );
  } else if (empty) {
    body = typeof empty === 'string'
      ? <div className="zx-chart-card__placeholder" style={{ height }}><Empty description={empty} /></div>
      : empty;
  }
  return (
    <Card
      title={(
        <div className="zx-chart-card__title">
          <Text strong style={{ fontSize: 14 }}>{title}</Text>
          {extra}
        </div>
      )}
      bodyStyle={{ padding: '12px 16px 8px' }}
    >
      {body}
    </Card>
  );
}
