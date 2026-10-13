import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionContext } from '@/hooks/usePermission';
import { PreferencesContext } from '@/hooks/usePreferences';
import { createPreferencesContext } from '@/test-utils/preferences';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));

// Modal.confirm 是 Semi 的旧版命令式渲染 API（依赖 createRoot 注入），jsdom 下无法真实渲染；
// 记录配置后手动触发 onOk，其余行为（危险按钮样式、确认文案）仍走真实的 confirmDelete。
const confirmCalls: { title?: string; content?: React.ReactNode; okButtonProps?: Record<string, unknown>; onOk?: () => void | Promise<void> }[] = [];
vi.mock('@douyinfe/semi-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@douyinfe/semi-ui')>();
  Object.assign(actual.Modal, {
    confirm: (config: { title?: string; content?: React.ReactNode; okButtonProps?: Record<string, unknown>; onOk?: () => void | Promise<void> }) => {
      confirmCalls.push(config);
      return { destroy: () => {} };
    },
  });
  return actual;
});

import LogFilesPage from './LogFilesPage';

const FILE_A = 'app.2026-10-12.1.log';
const FILE_B = 'app-api.2026-10-11.1.log';
const FILE_C = 'app-worker.2026-10-10.1.log';

const file = (name: string) => ({ name, size: 1024, modifiedAt: '2026-10-12 21:40:03', isGzip: false });

function renderPage() {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/system/log-files']}>
        <PermissionContext.Provider value={['system:log:files', 'system:log:files:delete']}>
          <PreferencesContext.Provider value={createPreferencesContext()}>
            <LogFilesPage />
          </PreferencesContext.Provider>
        </PermissionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

/** 进入选择模式：勾选框与底部操作条只在显式进入后才渲染 */
function enterSelection() {
  fireEvent.click(screen.getByRole('button', { name: '选择' }));
}

/** 勾选指定文件：点复选框，不应顺带触发条目的「选中查看」 */
function check(name: string) {
  fireEvent.click(screen.getByRole('checkbox', { name: `选择 ${name}` }));
}

const lastConfirm = () => confirmCalls[confirmCalls.length - 1];
const confirmOk = () => void lastConfirm().onOk?.();

beforeEach(() => {
  recorder.reset();
  confirmCalls.length = 0;
  recorder.on('GET', '/api/log-files', [file(FILE_A), file(FILE_B), file(FILE_C)]);
  recorder.on('GET', /\/content/, { lines: [] });
  recorder.on('DELETE', '/api/log-files/batch', { deleted: 2 });
});

describe('日志文件批量删除', () => {
  it('勾选多个文件后一次提交 DELETE /api/log-files/batch，删除后清选中', async () => {
    renderPage();
    await screen.findByText(FILE_A);

    enterSelection();
    check(FILE_B);
    check(FILE_C);
    await screen.findByRole('button', { name: /删除 \(2\)/ });
    fireEvent.click(screen.getByRole('button', { name: /删除 \(2\)/ }));

    expect(lastConfirm()).toMatchObject({
      title: '确定要删除选中的 2 个日志文件吗？',
      okButtonProps: { type: 'danger', theme: 'solid' },
    });
    confirmOk();

    await waitFor(() => expect(recorder.countOf('DELETE', '/api/log-files/batch')).toBe(1));
    expect(recorder.calls.find((c) => c.method === 'DELETE')?.body).toEqual({ filenames: [FILE_B, FILE_C] });
    await waitFor(() =>      expect(screen.queryByRole('button', { name: /删除 \(/ })).not.toBeInTheDocument());
  });

  it('勾选框只在选择模式内可见，退出后清空勾选', async () => {
    renderPage();
    await screen.findByText(FILE_A);

    // 默认浏览态：条目不带勾选框，也没有底部操作条
    expect(screen.queryByRole('checkbox', { name: `选择 ${FILE_A}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '全选' })).not.toBeInTheDocument();

    enterSelection();
    check(FILE_A);
    await screen.findByRole('button', { name: /删除 \(1\)/ });

    fireEvent.click(screen.getByRole('button', { name: '退出' }));
    expect(screen.queryByRole('checkbox', { name: `选择 ${FILE_A}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除 \(/ })).not.toBeInTheDocument();

    // 重新进入时不带上一轮勾选
    enterSelection();
    expect(screen.queryByRole('button', { name: /删除 \(/ })).not.toBeInTheDocument();
    await screen.findByRole('checkbox', { name: `选择 ${FILE_A}` });
    expect(screen.getByRole('checkbox', { name: `选择 ${FILE_A}` })).not.toBeChecked();
  });


  it('删除正在查看的文件后回到未选中态，且不回源已删文件的内容', async () => {
    renderPage();
    await screen.findByText(FILE_A);

    fireEvent.click(screen.getByText(FILE_A));
    await screen.findByPlaceholderText('搜索日志内容');
    await waitFor(() => expect(recorder.countOf('GET', /\/content/)).toBe(1));
    recorder.resetCalls();

    enterSelection();
    check(FILE_A);
    fireEvent.click(await screen.findByRole('button', { name: /删除 \(1\)/ }));
    expect(lastConfirm().title).toBe('确定要删除选中的 1 个日志文件吗？');
    confirmOk();

    await waitFor(() => expect(recorder.countOf('DELETE', '/api/log-files/batch')).toBe(1));
    await waitFor(() => expect(recorder.countOf('GET', '/api/log-files')).toBe(1));
    await screen.findByText('请从左侧选择一个日志文件查看');
    // 回归：content 查询与列表同属 'log-files' 前缀，域级失效会回源已删文件 → 404「文件不存在」
    expect(recorder.countOf('GET', /\/content/)).toBe(0);
  });

  it('勾选复选框不会顺带选中条目（全选在筛选后按可见项重算）', async () => {
    renderPage();
    await screen.findByText(FILE_A);

    enterSelection();
    fireEvent.click(screen.getByRole('checkbox', { name: '全选' }));
    await screen.findByRole('button', { name: /删除 \(3\)/ });
    // 未打开任何文件：勾选不触发详情
    expect(screen.queryByPlaceholderText('搜索日志内容')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('搜索文件名'), { target: { value: 'app-api' } });
    await waitFor(() => expect(screen.queryByText(FILE_A)).not.toBeInTheDocument());
    // 筛选不丢已选项，仍是 3 个
    await screen.findByRole('button', { name: /删除 \(3\)/ });
  });

  it('无删除权限时不渲染勾选框与批量按钮', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/system/log-files']}>
          <PermissionContext.Provider value={['system:log:files']}>
            <PreferencesContext.Provider value={createPreferencesContext()}>
              <LogFilesPage />
            </PreferencesContext.Provider>
          </PermissionContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText(FILE_A);
    expect(screen.queryByRole('checkbox', { name: `选择 ${FILE_A}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '全选' })).not.toBeInTheDocument();
    // 无删除权限时连选择模式入口都不渲染
    expect(screen.queryByRole('button', { name: '选择' })).not.toBeInTheDocument();
  });
});