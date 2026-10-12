import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionContext } from '@/hooks/usePermission';
import { PreferencesContext } from '@/hooks/usePreferences';
import { createPreferencesContext } from '@/test-utils/preferences';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import LogFilesPage from './LogFilesPage';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));

const FILENAME = 'app.2026-10-12.1.log';
const FIRST_TRACE = 'trace-first-12345';
const SECOND_TRACE = 'trace-second-12345';

function PageWithNavigation() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate(`/system/log-files?file=${FILENAME}&traceId=${SECOND_TRACE}`)}>另一条链路</button>
    <LogFilesPage />
  </>;
}

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', '/api/log-files', [
    { name: FILENAME, size: 1024, modifiedAt: '2026-10-12 21:40:03', isGzip: false },
  ]);
  recorder.on('GET', `/api/log-files/${FILENAME}/content`, { lines: [] });
});

describe('链路日志深链', () => {
  it.each([true, false])('同文件切换链路会更新定位（URL 同步 %s）', async (syncPageStateToUrl) => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={[`/system/log-files?file=${FILENAME}&traceId=${FIRST_TRACE}&keyword=old-error&level=error`]}>
          <PermissionContext.Provider value={['system:log:files']}>
            <PreferencesContext.Provider value={createPreferencesContext({ syncPageStateToUrl })}>
              <PageWithNavigation />
            </PreferencesContext.Provider>
          </PermissionContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(`链路定位：${FIRST_TRACE}`)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索日志内容')).toHaveValue('old-error');
    fireEvent.click(screen.getByRole('button', { name: '另一条链路' }));
    expect(await screen.findByText(`链路定位：${SECOND_TRACE}`)).toBeInTheDocument();
    expect(screen.queryByText(`链路定位：${FIRST_TRACE}`)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索日志内容')).toHaveValue(SECOND_TRACE);
    await waitFor(() => {
      const requests = recorder.urls('GET').filter((url) => url.includes('/content'));
      expect(requests.map((url) => new URLSearchParams(url.split('?')[1]).get('locateTraceId'))).toEqual([FIRST_TRACE, SECOND_TRACE]);
    });

    const closeButton = screen.getByText(`链路定位：${SECOND_TRACE}`).closest('.semi-tag')?.querySelector('.semi-tag-close');
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);
    await waitFor(() => expect(screen.queryByText(`链路定位：${SECOND_TRACE}`)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '另一条链路' }));
    expect(await screen.findByText(`链路定位：${SECOND_TRACE}`)).toBeInTheDocument();
  });
});
