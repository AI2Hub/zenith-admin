/**
 * 日志工作台正文搜索与链路定位：
 * 挂载时预填搜索框并高亮匹配；无深链时搜索框为空。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import { LogWorkbench, type LogWorkbenchProps } from './LogWorkbench';
import { useLogTail } from './useLogTail';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));
vi.mock('./useLogTail', () => ({ MAX_TAIL_LINES: 20000, useLogTail: vi.fn() }));

const FILENAME = 'app.2026-10-12.1.log';
const KEYWORD = 'trace-abc-12345';

beforeEach(() => {
  localStorage.removeItem('logWorkbench.palette');
  recorder.reset();
  vi.mocked(useLogTail).mockReturnValue({
    tailing: false, paused: false, reconnecting: false, lines: [], pendingCount: 0, capped: false,
    start: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  });
  recorder.on('GET', `/api/log-files/${FILENAME}/content`, {
    lines: [
      '{"level":30,"reqId":"other-trace","msg":"GET /api/users 200 5ms"}',
      `{"level":30,"reqId":"${KEYWORD}","msg":"POST /api/mp/fans/unblacklist 200 60ms"}`,
    ],
  });
});

function renderWorkbench(initialKeyword?: string, extra: Partial<LogWorkbenchProps> = {}) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <LogWorkbench source={{ kind: 'file', filename: FILENAME }} canTail={false} initialKeyword={initialKeyword} {...extra} />
    </QueryClientProvider>,
  );
}

describe('initialKeyword 深链预填', () => {
  it('预填搜索框并计数首个匹配', async () => {
    renderWorkbench(KEYWORD);

    expect(screen.getByDisplayValue(KEYWORD)).toBeInTheDocument();
    expect(await screen.findByText('1/1')).toBeInTheDocument();
  });

  it('无 initialKeyword 时搜索框为空', () => {
    renderWorkbench();

    expect(screen.getByPlaceholderText('搜索日志内容')).toHaveValue('');
  });
});

describe('精确链路定位', () => {
  it('实时追踪保留全部行，但仅计数所属链路的匹配', async () => {
    vi.mocked(useLogTail).mockReturnValue({
      tailing: true, paused: false, reconnecting: false, pendingCount: 0, capped: false,
      lines: [
        JSON.stringify({ level: 30, reqId: KEYWORD, msg: 'POST /api/orders 200' }),
        JSON.stringify({ level: 30, reqId: 'trace-query-12345', msg: `GET /api/trace/${KEYWORD} 200` }),
      ],
      start: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    });
    renderWorkbench(KEYWORD, { canTail: true, initialTraceId: KEYWORD });

    expect(await screen.findByText('1/1')).toBeInTheDocument();
    expect(recorder.countOf('GET', `/api/log-files/${FILENAME}/content`)).toBe(0);
  });

  it('发送 locateTraceId 加载连续日志并预填搜索，普通正文搜索保留定位窗口', async () => {
    renderWorkbench(undefined, { initialTraceId: KEYWORD });

    expect(screen.getByText(`链路定位：${KEYWORD}`)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索日志内容')).toHaveValue(KEYWORD);
    await waitFor(() => expect(recorder.countOf('GET', `/api/log-files/${FILENAME}/content`)).toBe(1));
    const params = new URLSearchParams(recorder.urls('GET')[0].split('?')[1]);
    expect(params.get('locateTraceId')).toBe(KEYWORD);
    expect(params.has('traceId')).toBe(false);
    expect(params.has('keyword')).toBe(false);

    fireEvent.change(screen.getByPlaceholderText('搜索日志内容'), { target: { value: 'unblacklist' } });
    expect(await screen.findByText('1/1')).toBeInTheDocument();
    expect(screen.getByText(`链路定位：${KEYWORD}`)).toBeInTheDocument();
    expect(recorder.countOf('GET', `/api/log-files/${FILENAME}/content`)).toBe(1);
  });
});

describe('日志配色偏好', () => {
  it('选择配色即时生效并在重新挂载后保留，不重新请求日志', async () => {
    const view = renderWorkbench();
    await waitFor(() => expect(view.container.querySelector('.log-content-view')).toHaveAttribute('data-palette', 'github'));
    fireEvent.click(screen.getByRole('combobox', { name: '日志配色' }));
    fireEvent.click(await screen.findByText('Nord'));
    // Semi Select 在收起动画完成后才触发受控值的 onChange；CI 慢机上 1s 默认窗口可能不够，放宽到 3s。
    await waitFor(() => expect(view.container.querySelector('.log-content-view')).toHaveAttribute('data-palette', 'nord'), { timeout: 3000 });
    expect(recorder.countOf('GET', `/api/log-files/${FILENAME}/content`)).toBe(1);
    view.unmount();
    const reopened = renderWorkbench();
    await waitFor(() => expect(reopened.container.querySelector('.log-content-view')).toHaveAttribute('data-palette', 'nord'), { timeout: 3000 });
  });
});
