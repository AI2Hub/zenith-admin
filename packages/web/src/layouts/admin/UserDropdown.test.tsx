/**
 * 顶栏用户区形态（偏好设置「顶栏用户信息」）：
 * 默认仅头像，可切到头像 + 昵称 / 仅昵称；不显示昵称时昵称退到触发器 title 上。
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@zenith/shared/identity';
import type { UserDisplayMode } from '@/hooks/usePreferences';
import { PreferencesContext } from '@/hooks/usePreferences';
import { createPreferencesContext } from '@/test-utils/preferences';
import { UserDropdown } from './UserDropdown';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ parkedAccounts: [], impersonation: null, endImpersonation: vi.fn() }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasAnyPermission: () => false }),
}));
// 账号切换弹层依赖完整认证上下文，与用户区形态无关，这里不渲染
vi.mock('./AccountSwitcher', () => ({ AccountSwitcherModal: () => null }));

const user: Omit<User, 'password'> = {
  id: 1,
  username: 'admin',
  nickname: '管理员',
  email: 'admin@example.com',
  avatar: null,
  roles: [],
  status: 'enabled',
  passwordUpdatedAt: '2026-01-01 00:00:00',
  createdAt: '2026-01-01 00:00:00',
  updatedAt: '2026-01-01 00:00:00',
};

function renderUser(overrides: { userDisplayMode?: UserDisplayMode } = {}) {
  const { container } = render(
    <MemoryRouter>
      <PreferencesContext.Provider value={createPreferencesContext(overrides)}>
        <UserDropdown
          user={user}
          navigate={vi.fn()}
          unreadCount={0}
          announcementUnreadCount={0}
          feedbackEntryEnabled={false}
          preferencesEntryEnabled
          setFeedbackVisible={vi.fn()}
          setPrefsVisible={vi.fn()}
          setShortcutsVisible={vi.fn()}
          enableLockScreen={false}
          confirmLogout={false}
          hasPassword={() => false}
          lock={vi.fn()}
          disconnectWs={vi.fn()}
          clearLockPassword={vi.fn()}
          onLogout={vi.fn()}
        />
      </PreferencesContext.Provider>
    </MemoryRouter>,
  );
  const trigger = container.querySelector('.admin-header__user') as HTMLElement;
  return { trigger };
}

describe('顶栏用户区显示模式', () => {
  it('默认仅头像：不渲染昵称，昵称退到 title 供悬停查看', () => {
    const { trigger } = renderUser();

    expect(trigger.querySelector('.semi-avatar')).not.toBeNull();
    expect(trigger.querySelector('.admin-header__username')).toBeNull();
    expect(trigger).toHaveAttribute('title', '管理员');
  });

  it('头像 + 昵称：两者都渲染且不需要 title 兑底', () => {
    const { trigger } = renderUser({ userDisplayMode: 'both' });

    expect(trigger.querySelector('.semi-avatar')).not.toBeNull();
    expect(trigger.querySelector('.admin-header__username')).toHaveTextContent('管理员');
    expect(trigger).not.toHaveAttribute('title');
  });

  it('仅昵称：不渲染头像，仍显示昵称', () => {
    const { trigger } = renderUser({ userDisplayMode: 'name' });

    expect(trigger.querySelector('.semi-avatar')).toBeNull();
    expect(trigger.querySelector('.admin-header__username')).toHaveTextContent('管理员');
    expect(trigger.className).toContain('admin-header__user--no-avatar');
  });
});
