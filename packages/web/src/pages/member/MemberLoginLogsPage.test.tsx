/**
 * 会员登录日志详情弹窗：详情内容来自列表行本身（不额外取详情接口），
 * 且弹窗里能看到列表未展示的 `User-Agent`；关闭后弹窗消失。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionContext } from '@/hooks/usePermission';
import { PreferencesContext } from '@/hooks/usePreferences';
import { createPreferencesContext } from '@/test-utils/preferences';
import { ApiRecorder, createRequestMock, createTestQueryClient } from '@/test-utils/query-harness';
import MemberLoginLogsPage from './MemberLoginLogsPage';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));

const MEMBER_NICKNAME = '测试会员';
const USER_AGENT = 'ua-member-detail-test';

const loginLogRow = {
  id: 1,
  memberId: 9,
  memberNickname: MEMBER_NICKNAME,
  ip: '10.0.0.9',
  location: '本地',
  browser: 'Chrome',
  os: 'Windows',
  userAgent: USER_AGENT,
  status: 'success' as const,
  message: null,
  createdAt: '2026-10-15 10:00:00',
};

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <PermissionContext.Provider value={['member:loginlog:list']}>
          <PreferencesContext.Provider value={createPreferencesContext()}>
            <MemberLoginLogsPage />
          </PreferencesContext.Provider>
        </PermissionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  recorder.reset();
  recorder.on('GET', '/api/members/login-logs', () => ({ list: [loginLogRow], total: 1 }));
});

describe('会员登录日志详情弹窗', () => {
  it('点击「详情」打开弹窗展示列表未包含的 User-Agent，且不额外请求详情接口', async () => {
    renderPage();

    expect(await screen.findByText(MEMBER_NICKNAME)).toBeInTheDocument();
    expect(screen.queryByText('会员登录日志详情')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(await screen.findByText('会员登录日志详情')).toBeInTheDocument();
    expect(screen.getByText('User-Agent')).toBeInTheDocument();
    expect(screen.getByText(USER_AGENT)).toBeInTheDocument();
    // 详情取自列表行，不应为此再发一次列表请求
    expect(recorder.countOf('GET', '/api/members/login-logs')).toBe(1);
  });

  it('关闭弹窗后清除详情内容，并可重新打开', async () => {
    renderPage();

    expect(await screen.findByText(MEMBER_NICKNAME)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(await screen.findByText('会员登录日志详情')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    await waitFor(() => expect(screen.queryByText(USER_AGENT)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(await screen.findByText(USER_AGENT)).toBeInTheDocument();
  });
});
