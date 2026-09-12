import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartCard } from './ChartCard';

describe('ChartCard', () => {
  it('renders the title in the card header and the chart as body', () => {
    const { container } = render(<ChartCard title="消息趋势"><svg data-testid="chart" /></ChartCard>);
    expect(screen.getByText('消息趋势')).toBeTruthy();
    expect(screen.getByTestId('chart')).toBeTruthy();
    expect(container.querySelector('.zx-chart-card__placeholder')).toBeNull();
  });

  it('renders extra next to the title', () => {
    render(<ChartCard title="会话评分分布" extra={<span>平均 4.2 分</span>}>x</ChartCard>);
    expect(screen.getByText('平均 4.2 分')).toBeTruthy();
  });

  it('loading: default paragraph skeleton sized to the chart height; placeholder prop overrides it', () => {
    const { container, rerender } = render(<ChartCard title="t" loading height={240}><svg data-testid="chart" /></ChartCard>);
    const placeholder = container.querySelector<HTMLElement>('.zx-chart-card__placeholder')!;
    expect(placeholder.style.height).toBe('240px');
    expect(container.querySelector('.semi-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();

    rerender(<ChartCard title="t" loading placeholder={<i data-testid="custom" />}><svg data-testid="chart" /></ChartCard>);
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(container.querySelector('.zx-chart-card__placeholder')).toBeNull();
  });

  it('empty: string renders a centered Empty, element renders as-is, falsy keeps the chart', () => {
    const { container, rerender } = render(<ChartCard title="t" empty="暂无会话数据"><svg data-testid="chart" /></ChartCard>);
    expect(screen.getByText('暂无会话数据')).toBeTruthy();
    expect(container.querySelector('.zx-chart-card__placeholder')).not.toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();

    rerender(<ChartCard title="t" empty={<b data-testid="custom-empty">无</b>}><svg data-testid="chart" /></ChartCard>);
    expect(screen.getByTestId('custom-empty')).toBeTruthy();

    rerender(<ChartCard title="t" empty={null}><svg data-testid="chart" /></ChartCard>);
    expect(screen.getByTestId('chart')).toBeTruthy();
  });

  it('loading wins over empty', () => {
    render(<ChartCard title="t" loading empty="暂无数据"><svg data-testid="chart" /></ChartCard>);
    expect(screen.queryByText('暂无数据')).toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
  });
});
