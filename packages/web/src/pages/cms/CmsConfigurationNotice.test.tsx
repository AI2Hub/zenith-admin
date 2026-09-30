import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsConfigurationState } from '@zenith/shared/cms';
import CmsConfigurationNotice from './CmsConfigurationNotice';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), query: { data: undefined as CmsConfigurationState | undefined, isError: false, error: new Error('读取失败'), refetch: vi.fn() } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/queries/cms-workbench', () => ({ useCmsConfigurationState: () => mocks.query, useCmsConfigurationDraft: () => ({ data: null }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.query.isError = false; mocks.query.data = { siteId: 1, kind: 'page', objectId: 4, state: 'online', generationId: 8, hasPublished: true, savedAt: null, release: null }; });
describe('configuration notice state boundaries', () => {
  it('does not borrow the site state for a multi-object channel/workspace notice', () => {
    render(<CmsConfigurationNotice siteId={1} />);
    expect(screen.queryByText('已上线')).not.toBeInTheDocument();
    expect(screen.queryByText('保存工作配置后，请前往发布中心审阅并激活。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开发布中心' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/cms/publishing?tab=releases&site=1');
  });
  it('shows the object state and follows the authorized matching release link', () => {
    mocks.query.data = { ...mocks.query.data!, state: 'pending', release: { id: 22, name: '共享发布', status: 'ready', href: '/cms/publishing?tab=releases&site=1&release=22', matchesSaved: true } };
    render(<CmsConfigurationNotice siteId={1} kind="page" objectId={4} />);
    expect(screen.getByText('待发布')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '审阅待发布配置 #22' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/cms/publishing?tab=releases&site=1&release=22');
  });
  it('does not keep a reassuring stale online badge when the state request fails', () => {
    mocks.query.isError = true;
    render(<CmsConfigurationNotice siteId={1} kind="page" objectId={4} />);
    expect(screen.queryByText('已上线')).not.toBeInTheDocument(); expect(screen.getByText(/配置上线状态读取失败/)).toBeInTheDocument();
  });
});
