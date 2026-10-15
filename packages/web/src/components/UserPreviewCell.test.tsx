/**
 * UserPreviewCell 行为测试。
 *
 * 断言落在「实际发了几个请求 / 打到哪个 URL」，而不是「hook 被调用了」：
 * 该组件被部门 / 角色 / 岗位 / 用户组四个列表页的每一行复用，
 * 「未展开就不请求」一旦回归，一页 20 行就会瞬间打出 20 个查询，
 * 这种问题只有请求级断言才拦得住。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import {
  ApiRecorder,
  createRequestMock,
  createTestQueryClient,
  createWrapper,
} from '@/test-utils/query-harness';

const api = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => api) }));
vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { tablePageSize: 10 }, updatePreferences: vi.fn() }),
  useOptionalPreferences: () => ({ preferences: { tablePageSize: 10 }, updatePreferences: vi.fn() }),
  defaultPreferences: { tablePageSize: 10 },
}));

import { UserPreviewCell, type UserPreviewScope } from './UserPreviewCell';

const PREVIEW = [
  { id: 1, nickname: '管理员', avatar: null },
  { id: 2, nickname: '张三', avatar: null },
];

const SCOPE: UserPreviewScope = { type: 'department', id: 7, name: '研发部' };

let client: QueryClient;

function renderCell(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper(client) });
}

beforeEach(() => {
  api.reset();
  client = createTestQueryClient();
  api.on('GET', /\/api\/departments\/7\/member-preview/, {
    list: [
      { id: 1, username: 'admin', nickname: '管理员', avatar: null },
      { id: 2, username: 'zhangsan', nickname: '张三', avatar: null },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  });
});

afterEach(() => {
  client.clear();
});

describe('UserPreviewCell', () => {
  it('成员数为 0 时只显示数量、不可点击', () => {
    renderCell(<UserPreviewCell preview={[]} count={0} scope={SCOPE} />);

    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('不传 scope 时退化为纯展示，不渲染按钮', () => {
    renderCell(<UserPreviewCell preview={PREVIEW} count={2} />);

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('传入 scope 后可点击，但未展开时不发请求', () => {
    renderCell(<UserPreviewCell preview={PREVIEW} count={2} scope={SCOPE} />);

    expect(screen.getByRole('button', { name: '查看部门「研发部」的 2 名成员' })).toBeTruthy();
    expect(api.countOf('GET')).toBe(0);
  });

  it('点击后才请求成员名单，并按 scope 拼出对应来源的 URL', async () => {
    const user = userEvent.setup();
    renderCell(<UserPreviewCell preview={PREVIEW} count={2} scope={SCOPE} />);

    await user.click(screen.getByRole('button', { name: /查看部门/ }));

    await waitFor(() => expect(api.countOf('GET')).toBe(1));
    expect(api.urls('GET')[0]).toContain('/api/departments/7/member-preview');
    expect(await screen.findByText('zhangsan')).toBeTruthy();
  });

  it('不同 scope 打到各自的接口段', async () => {
    api.on('GET', /\/api\/user-groups\/3\/member-preview/, { list: [], total: 0, page: 1, pageSize: 10 });
    const user = userEvent.setup();
    renderCell(
      <UserPreviewCell
        preview={PREVIEW}
        count={2}
        scope={{ type: 'userGroup', id: 3, name: '内测组' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /查看用户组/ }));

    await waitFor(() => expect(api.countOf('GET')).toBe(1));
    expect(api.urls('GET')[0]).toContain('/api/user-groups/3/member-preview');
  });
});
