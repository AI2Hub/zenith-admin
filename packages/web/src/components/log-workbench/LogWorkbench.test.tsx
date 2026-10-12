/**
 * 日志工作台正文搜索与独立链路筛选：
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

describe('精确链路筛选', () => {
  it('实时追踪只展示所属链路的行，忽略正文中出现该 ID 的查询请求', async () => {
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

  it('发送独立 traceId 筛选，普通正文搜索变化不改变链路归属', async () => {
    renderWorkbench(undefined, { initialTraceId: KEYWORD });

    expect(screen.getByText(`链路筛选：${KEYWORD}`)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索日志内容')).toHaveValue('');
    await waitFor(() => expect(recorder.countOf('GET', `/api/log-files/${FILENAME}/content`)).toBe(1));
    const params = new URLSearchParams(recorder.urls('GET')[0].split('?')[1]);
    expect(params.get('traceId')).toBe(KEYWORD);
    expect(params.has('keyword')).toBe(false);

    fireEvent.change(screen.getByPlaceholderText('搜索日志内容'), { target: { value: 'unblacklist' } });
    expect(await screen.findByText('1/1')).toBeInTheDocument();
    expect(screen.getByText(`链路筛选：${KEYWORD}`)).toBeInTheDocument();
    expect(recorder.countOf('GET', `/api/log-files/${FILENAME}/content`)).toBe(1);
  });
});
