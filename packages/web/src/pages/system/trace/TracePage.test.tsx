/**
 * 链路追踪默认视图：没有 traceId 时展示「最近链路」列表（浏览入口），
 * 行内「查看链路」与 ?traceId= 深链都落到时间线查询；无 ID 时不请求时间线。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionContext } from '@/hooks/usePermission';
import { PreferencesContext } from '@/hooks/usePreferences';
import { createPreferencesContext } from '@/test-utils/preferences';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import TracePage from './TracePage';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));

const recentEntry = {
  traceId: 'trace-abc-12345',
  ts: '2026-09-27 10:00:00',
  title: 'POST /api/orders',
  status: 'failed' as const,
  nodeCount: 3,
  failedCount: 1,
};

/** 时间线 URL（排除静态的 /recent、/recent-failures） */
const TIMELINE_RE = /\/api\/trace\/(?!recent)[\w-]+$/;

function renderPage(path = '/system/trace') {
  const client = createTestQueryClient();
  const preferences = createPreferencesContext();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PermissionContext.Provider value={['system:trace:view']}>
          <PreferencesContext.Provider value={preferences}>
            <TracePage />
          </PreferencesContext.Provider>
        </PermissionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', '/api/trace/recent', () => [recentEntry]);
  recorder.on('GET', TIMELINE_RE, (call: { url: string }) => ({
    traceId: decodeURIComponent(call.url.split('/').pop() ?? ''),
    nodes: [],
  }));
});

describe('链路追踪默认视图', () => {
  it('无 traceId 时默认展示最近链路列表并请求 /api/trace/recent，不请求时间线', async () => {
    renderPage();

    await waitFor(() => expect(recorder.countOf('GET', '/api/trace/recent')).toBe(1));
    expect(recorder.urls('GET')[0]).toContain('days=7');
    expect(await screen.findByText('POST /api/orders')).toBeInTheDocument();
    expect(await screen.findByText(recentEntry.traceId)).toBeInTheDocument();
    expect(recorder.countOf('GET', TIMELINE_RE)).toBe(0);
  });

  it('行内「查看链路」把链路 ID 填入查询并拉取时间线', async () => {
    renderPage();

    const viewButton = await screen.findByRole('button', { name: '查看链路' });
    fireEvent.click(viewButton);

    await waitFor(() => expect(recorder.countOf('GET', TIMELINE_RE)).toBe(1));
    expect(recorder.urls('GET').some((u) => u.includes(`/api/trace/${recentEntry.traceId}`))).toBe(true);
    expect(screen.getByDisplayValue(recentEntry.traceId)).toBeInTheDocument();
  });

  it('?traceId= 深链直接查时间线，不再请求最近链路列表', async () => {
    renderPage(`/system/trace?traceId=${recentEntry.traceId}`);

    await waitFor(() => expect(recorder.countOf('GET', TIMELINE_RE)).toBe(1));
    expect(recorder.countOf('GET', '/api/trace/recent')).toBe(0);
    // 时间线为空时给出「未找到留痕」而不是最近链路列表
    expect(await screen.findByText(/未找到该链路的留痕/)).toBeInTheDocument();
  });
});

/** 日志行经语法分词渲染为多个 span：按行容器定位（容器 textContent 同样恒等于整行，需排除）。 */
const byLogLine = (line: string) => (_content: string, el: Element | null): boolean =>
  el?.textContent === line && (el?.classList.contains('log-content-row') ?? false);

/** 跳转断言用的日志文件页替身：原样回显深链参数 */
function LogFilesStub() {
  const [params] = useSearchParams();
  return <div>{`file=${params.get('file')}&traceId=${params.get('traceId')}&keyword=${params.get('keyword')}`}</div>;
}

describe('链路追踪 → 日志文件跳转', () => {
  const traceFile = 'app.2026-10-12.1.log';
  const logLine = `{"level":30,"reqId":"${recentEntry.traceId}","msg":"POST /api/mp/fans/unblacklist 200 60ms"}`;

  function renderWithRoutes(path: string) {
    const client = createTestQueryClient();
    const preferences = createPreferencesContext();
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <PermissionContext.Provider value={['system:trace:view', 'system:log:files']}>
            <PreferencesContext.Provider value={preferences}>
              <Routes>
                <Route path="/system/trace" element={<TracePage />} />
                <Route path="/system/log-files" element={<LogFilesStub />} />
              </Routes>
            </PreferencesContext.Provider>
          </PermissionContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it.each(['app', 'app-api', 'app-worker'])('优先检索链路发生日期的 %s 归档，而不是最近写入的查询日志', async (prefix) => {
    const historyFile = `${prefix}.2026-09-27.1.log.gz`;
    recorder.on('GET', TIMELINE_RE, {
      traceId: recentEntry.traceId,
      nodes: [{ kind: 'request', ts: '2026-09-27 10:00:00', title: 'POST /api/orders', status: 'success', durationMs: 1, refId: 1, parentRef: null, detail: {} }],
    });
    recorder.on('GET', '/api/log-files', [
      { name: traceFile, size: 1024, modifiedAt: '2026-10-12 21:40:03', isGzip: false },
      { name: historyFile, size: 1024, modifiedAt: '2026-09-27 23:59:00', isGzip: true },
    ]);
    recorder.on('GET', `/api/log-files/${historyFile}/content`, { lines: [logLine] });

    renderWithRoutes(`/system/trace?traceId=${recentEntry.traceId}`);

    expect(await screen.findByText(byLogLine(logLine))).toBeInTheDocument();
    expect(recorder.countOf('GET', `/api/log-files/${historyFile}/content`)).toBe(1);
    expect(recorder.countOf('GET', `/api/log-files/${traceFile}/content`)).toBe(0);
  });
});
