import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import type { LogWorkbenchProps } from '@/components/log-workbench/LogWorkbench';
import ConsoleLogsPage from './ConsoleLogsPage';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));
vi.mock('@/components/log-workbench/LogWorkbench', () => ({
  LogWorkbench: function Workbench({ source, autoTail, initialTraceId }: LogWorkbenchProps) {
    const [paused, setPaused] = useState(false);
    return <div data-testid="workbench" data-source={source.kind === 'console' ? source.role : source.kind} data-auto-tail={autoTail} data-trace-id={initialTraceId}>
      <button onClick={() => setPaused(!paused)}>{paused ? '已暂停测试' : '暂停测试'}</button>
    </div>;
  },
}));

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', '/api/console-logs', {
    currentRole: 'api', hostname: 'zenith-api-01', pid: 9001,
    sources: [{ role: 'api', label: 'API', available: true }, { role: 'worker', label: 'Worker', available: true }],
  });
});

function renderPage(search = '') {
  return render(<MemoryRouter initialEntries={[`/system/console-logs${search}`]}>
    <QueryClientProvider client={createTestQueryClient()}><ConsoleLogsPage /></QueryClientProvider>
  </MemoryRouter>);
}

describe('ConsoleLogsPage', () => {
  it('默认使用当前角色自动追踪，角色切换重置工作台并标明当前 API 实例', async () => {
    renderPage();
    const workbench = await screen.findByTestId('workbench');
    expect(workbench).toHaveAttribute('data-source', 'api');
    expect(workbench).toHaveAttribute('data-auto-tail', 'true');
    expect(screen.getByText('当前后端实例：zenith-api-01 · PID 9001')).toBeInTheDocument();
    fireEvent.click(screen.getByText('暂停测试'));
    expect(screen.getByText('已暂停测试')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: '日志来源' }));
    fireEvent.click(await screen.findByText('Worker'));
    expect(screen.getByTestId('workbench')).toHaveAttribute('data-source', 'worker');
    expect(screen.getByText('暂停测试')).toBeInTheDocument();
    expect(screen.getByText('当前后端实例：zenith-api-01 · PID 9001')).toBeInTheDocument();
  });

  it('链路深链保留历史定位窗口，无效角色回退当前后端角色', async () => {
    renderPage('?role=invalid&traceId=request-trace-123');
    const workbench = await screen.findByTestId('workbench');
    expect(workbench).toHaveAttribute('data-source', 'api');
    expect(workbench).toHaveAttribute('data-auto-tail', 'false');
    expect(workbench).toHaveAttribute('data-trace-id', 'request-trace-123');
  });
});
