import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportDashboardConfig, ReportGridItem, ReportWidget } from '@zenith/shared';
import { ScreenCanvas } from './ScreenCanvas';

vi.mock('react-grid-layout/legacy', () => {
  const Grid = ({ className, children }: { className?: string; children?: React.ReactNode }) => (
    <div className={className}>{children}</div>
  );
  return { default: Grid, WidthProvider: (Component: typeof Grid) => Component };
});

vi.mock('./WidgetRenderer', () => ({
  WidgetRenderer: ({ widget }: { widget: ReportWidget }) => (
    <div>
      {widget.options?.text as string}
      <button type="button">内部操作-{widget.i}</button>
    </div>
  ),
}));

function installViewport(mobile: boolean) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: mobile ? 375 : 1280 });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(max-width: 767px)' ? mobile : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const widgets: ReportWidget[] = [
  { i: 'late', type: 'text', title: 'Late', options: { text: 'late' } },
  { i: 'right', type: 'text', title: 'Right', options: { text: 'right' } },
  { i: 'left', type: 'text', title: 'Left', options: { text: 'left' } },
];

const layout: ReportGridItem[] = [
  { i: 'late', x: 0, y: 2, w: 12, h: 3 },
  { i: 'right', x: 6, y: 0, w: 6, h: 3 },
  { i: 'left', x: 0, y: 0, w: 6, h: 3 },
];

function renderCanvas(config: ReportDashboardConfig = {}) {
  return render(
    <ScreenCanvas
      widgets={widgets}
      layout={layout}
      canvasLayout={[]}
      config={config}
      filterValues={{}}
      getWidgetState={() => ({ data: null })}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ScreenCanvas responsive reading layout', () => {
  it('uses one column at 375px and orders widgets by original y/x without mutating the saved layout', () => {
    installViewport(true);
    const savedLayout = structuredClone(layout);
    renderCanvas();

    const reading = screen.getByTestId('report-mobile-reading');
    expect(reading.children).toHaveLength(3);
    expect([...reading.children].map((item) => item.getAttribute('data-widget-id')))
      .toEqual(['left', 'right', 'late']);
    expect([...reading.children].every((item) => (item as HTMLElement).style.minHeight !== '')).toBe(true);
    expect(layout).toEqual(savedLayout);
  });

  it('keeps the desktop grid path and original widget render order unchanged', () => {
    installViewport(false);
    const { container } = renderCanvas();

    expect(screen.queryByTestId('report-mobile-reading')).toBeNull();
    expect(container.querySelector('.report-grid')).not.toBeNull();
    expect([...container.querySelectorAll('.report-widget-card__title')].map((node) => node.textContent))
      .toEqual(['Late', 'Right', 'Left']);
  });

  it('keeps canvas content readable and shows a concise landscape recommendation on mobile', () => {
    installViewport(true);
    renderCanvas({ layoutMode: 'canvas' });

    expect(screen.getByRole('note').textContent).toContain('横屏');
    expect(screen.getByTestId('report-mobile-reading').children).toHaveLength(3);
  });

  it('only triggers the widget action from the header, not interactive body controls', () => {
    installViewport(false);
    const onWidgetClick = vi.fn();
    render(
      <ScreenCanvas
        widgets={widgets}
        layout={layout}
        canvasLayout={[]}
        config={{}}
        filterValues={{}}
        getWidgetState={() => ({ data: null })}
        onWidgetClick={onWidgetClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '内部操作-late' }));
    expect(onWidgetClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Late' }));
    expect(onWidgetClick).toHaveBeenCalledWith(widgets[0]);
  });
});
