import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_MODULES, type SettingsRevisionDetail } from '@zenith/shared/settings';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper } from '@/test-utils/query-harness';
import { SettingsHistoryButton } from './SettingsHistoryButton';

const recorder = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => recorder) }));
vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { tablePageSize: 10 }, updatePreferences: vi.fn() }),
  useOptionalPreferences: () => ({ preferences: { tablePageSize: 10 }, updatePreferences: vi.fn() }),
  defaultPreferences: { tablePageSize: 10 },
}));

beforeEach(() => recorder.reset());

describe('初始版本比较', () => {
  it('留存历史从 v2 开始时默认比较 v0，不请求不存在的 v1', async () => {
    const effective = SETTINGS_MODULES.wiki.schema.parse({});
    const revision: SettingsRevisionDetail = {
      id: 20, version: 2, action: 'initial', restoredFromVersion: null, note: '初始快照',
      actorId: 1, actorName: 'admin', createdAt: null, changedPaths: [],
      overrides: {}, inherited: effective, effective, definitionHash: 'definition', definition: {}, inheritedVersion: 0,
    };
    recorder.on('GET', '/api/settings/wiki', {
      module: 'wiki', scope: 'platform', tenantId: null, version: 2, currentRevisionId: 20,
      baseToken: 'current', inheritedVersion: 0, definitionHash: 'definition', overrides: {},
      effective, inherited: effective, overriddenPaths: [], updatedAt: null,
    });
    recorder.on('GET', '/api/settings/wiki/versions?page=1&pageSize=10', { list: [revision], total: 1, page: 1, pageSize: 10 });
    recorder.on('GET', '/api/settings/wiki/versions/0', { ...revision, id: 0, version: 0 });
    recorder.on('GET', '/api/settings/wiki/versions/2', revision);
    recorder.on('GET', '/api/settings/wiki/versions/compare?from=0&to=2', { fromVersion: 0, toVersion: 2, changes: [] });
    render(<SettingsHistoryButton module="wiki" />, { wrapper: createWrapper(createTestQueryClient()) });
    fireEvent.click(screen.getByRole('button', { name: '版本历史' }));
    fireEvent.click(await screen.findByRole('button', { name: /版本 2/ }));
    fireEvent.click(screen.getByRole('tab', { name: '版本比较' }));
    await waitFor(() => expect(recorder.countOf('GET', '/api/settings/wiki/versions/compare?from=0&to=2')).toBe(1));
    expect(screen.getByLabelText('比较起点版本')).toHaveValue('0');
    expect(recorder.urls('GET').some((url) => url.includes('from=1'))).toBe(false);
    expect(await screen.findByText('值和继承关系均无变化')).toBeInTheDocument();
  });
});

describe('版本列表交互', () => {
  const effective = SETTINGS_MODULES.wiki.schema.parse({});
  const revision = (version: number): SettingsRevisionDetail => ({
    id: version, version, action: 'save', restoredFromVersion: null, note: `说明 ${version}`,
    actorId: 1, actorName: 'admin', createdAt: null, changedPaths: ['brand.title'],
    overrides: {}, inherited: effective, effective, definitionHash: 'definition', definition: {}, inheritedVersion: 0,
  });

  beforeEach(() => {
    recorder.on('GET', '/api/settings/wiki', {
      module: 'wiki', scope: 'platform', tenantId: null, version: 2, currentRevisionId: 2,
      baseToken: 'current', inheritedVersion: 0, definitionHash: 'definition', overrides: {},
      effective, inherited: effective, overriddenPaths: [], updatedAt: null,
    });
    recorder.on('GET', '/api/settings/wiki/versions?page=1&pageSize=10', { list: [revision(2), revision(1)], total: 2, page: 1, pageSize: 10 });
    recorder.on('GET', '/api/settings/wiki/versions/2', revision(2));
    recorder.on('GET', '/api/settings/wiki/versions/1', revision(1));
  });

  it('整行（不止版本号）都可点切换，且行内只有这一个点击目标', async () => {
    render(<SettingsHistoryButton module="wiki" />, { wrapper: createWrapper(createTestQueryClient()) });
    fireEvent.click(screen.getByRole('button', { name: '版本历史' }));
    const row = await screen.findByRole('button', { name: /版本 1/ });
    expect(row).toHaveAttribute('tabindex', '0');
    // 版本号不再是独立按钮，行本身即唯一交互元素
    expect(within(row).queryByRole('button')).toBeNull();
    // 点行内的作者 / 时间等元信息区域（而不是版本号文字）也应切换版本
    fireEvent.click(within(row).getByText(/admin/));
    await waitFor(() => expect(recorder.countOf('GET', '/api/settings/wiki/versions/1')).toBe(1));
    expect(await screen.findByRole('heading', { name: /^版本 1/ })).toBeInTheDocument();
  });

  it('整行可用键盘 Enter 切换版本', async () => {
    render(<SettingsHistoryButton module="wiki" />, { wrapper: createWrapper(createTestQueryClient()) });
    fireEvent.click(screen.getByRole('button', { name: '版本历史' }));
    fireEvent.keyDown(await screen.findByRole('button', { name: /版本 2/ }), { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: /版本 2/ })).toHaveAttribute('aria-current', 'true'));
    fireEvent.keyDown(screen.getByRole('button', { name: /版本 1/ }), { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: /版本 1/ })).toHaveAttribute('aria-current', 'true'));
    expect(recorder.countOf('GET', '/api/settings/wiki/versions/1')).toBe(1);
    expect(screen.getByRole('button', { name: /版本 2/ })).not.toHaveAttribute('aria-current');
  });
});
