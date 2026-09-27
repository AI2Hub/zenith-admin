/**
 * 链路追踪默认视图：没有 traceId 时展示「最近链路」列表（浏览入口），
 * 行内「查看链路」与 ?traceId= 深链都落到时间线查询；无 ID 时不请求时间线。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
