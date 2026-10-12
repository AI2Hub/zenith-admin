/**
 * 日志工作台 initialKeyword（链路追踪 `?keyword=` 深链）：
 * 挂载时预填搜索框并高亮匹配；无深链时搜索框为空。
 */
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import { LogWorkbench } from './LogWorkbench';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));

const FILENAME = 'app.2026-10-12.1.log';
const KEYWORD = 'trace-abc-12345';

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', `/api/log-files/${FILENAME}/content`, {
    lines: [
      '{"level":30,"reqId":"other-trace","msg":"GET /api/users 200 5ms"}',
      `{"level":30,"reqId":"${KEYWORD}","msg":"POST /api/mp/fans/unblacklist 200 60ms"}`,
    ],
  });
});

function renderWorkbench(initialKeyword?: string) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <LogWorkbench source={{ kind: 'file', filename: FILENAME }} canTail={false} initialKeyword={initialKeyword} />
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
