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
  it('does not show a configuration notice for an unsaved object', () => {
    const { container } = render(<CmsConfigurationNotice siteId={1} kind="page" />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows a lightweight online badge without an explanatory banner', () => {
    const { container } = render(<CmsConfigurationNotice siteId={1} kind="page" objectId={4} />);
    expect(screen.getByText('已上线')).toBeInTheDocument();
    expect(container.querySelector('.semi-banner')).toBeNull();
    expect(screen.queryByText('已保存配置与当前生效的线上版本一致。')).not.toBeInTheDocument();
  });
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
  it('keeps the publish entry for saved configurations that are not online', () => {
    mocks.query.data = { ...mocks.query.data!, state: 'saved' };
    render(<CmsConfigurationNotice siteId={1} kind="page" objectId={4} />);
    expect(screen.getByText('已保存配置尚未上线，请准备发布单并激活。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开发布中心' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/cms/publishing?tab=releases&site=1');
  });
  it('keeps related release actions if an online configuration has a release', () => {
    mocks.query.data = { ...mocks.query.data!, release: { id: 22, name: '共享发布', status: 'failed', href: '/cms/publishing?tab=releases&site=1&release=22', matchesSaved: false } };
    render(<CmsConfigurationNotice siteId={1} kind="page" objectId={4} />);
    expect(screen.getByText('已上线')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看失败发布单 #22' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/cms/publishing?tab=releases&site=1&release=22');
  });
  it('does not keep a reassuring stale online badge when the state request fails', () => {
    mocks.query.isError = true;
    render(<CmsConfigurationNotice siteId={1} kind="page" objectId={4} />);
    expect(screen.queryByText('已上线')).not.toBeInTheDocument(); expect(screen.getByText(/配置上线状态读取失败/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    expect(mocks.query.refetch).toHaveBeenCalledOnce();
  });
});
