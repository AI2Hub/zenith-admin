import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { useCmsDistributionConflict } from '@/hooks/queries/cms-editorial';
import { mockCmsContents } from '@/mocks/data/cms';
import CmsEditorialPanel from './CmsEditorialPanel';
import CmsFeedbackSheet from './CmsFeedbackSheet';

const state = vi.hoisted(() => ({
  conflict: {
    data: undefined as ReturnType<typeof useCmsDistributionConflict>['data'],
    isSuccess: false,
    isError: false,
    isFetching: true,
  },
  feedback: { data: undefined, isLoading: true, isError: false, error: null as Error | null },
}));

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/queries/cms-editorial', () => ({
  useCmsEditorialNotes: () => ({ data: [] }),
  useCmsQuality: () => ({ data: undefined, isError: false, isFetching: false, refetch: vi.fn() }),
  useCmsTranslations: () => ({ data: [] }),
  useCmsDistributionConflict: () => state.conflict,
  useCreateCmsTranslation: () => ({ isPending: false }),
  useResolveCmsDistribution: () => ({ isPending: false }),
  usePreviewCmsTypeConversion: () => ({ data: undefined, isPending: false }),
  useConvertCmsType: () => ({ isPending: false }),
}));
vi.mock('./CmsEditorialNotesPanel', () => ({ default: () => null }));
vi.mock('@/hooks/queries/cms-operations', () => ({
  useCmsFeedbackDetail: () => state.feedback,
  useCmsFeedbackWorkflow: () => ({ data: undefined, isLoading: false }),
  useCmsFeedbackWorkflowPreview: () => ({ data: undefined, isLoading: false }),
  useCreateCmsEditorialTask: () => ({ isPending: false }),
}));
vi.mock('./CmsEditorialTasks', () => ({ useCmsTaskEditor: () => ({ editor: null }) }));
vi.mock('@/components/workflow/WorkflowSideSheet', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/workflow/BusinessWorkflowPanel', () => ({ default: () => null }));

beforeEach(() => {
  state.conflict.data = undefined;
  state.conflict.isSuccess = false;
  state.conflict.isError = false;
  state.conflict.isFetching = true;
  state.feedback.isLoading = true;
  state.feedback.isError = false;
  state.feedback.error = null;
});

const emptyConflict = { version: 1, sourceVersion: 1, targetOwnedFields: [], conflicts: [] };
const mappedContent = { ...mockCmsContents[0], mappingSourceId: 7 };
const noConflictMessage = '当前没有待处理的分发冲突';

function openSourceSync() {
  const view = render(<CmsEditorialPanel content={mappedContent} models={[]} onChanged={() => undefined} onOpen={() => undefined} />);
  fireEvent.click(screen.getByRole('tab', { name: '来源同步' }));
  return view;
}

describe('CMS source synchronization result states', () => {
  it('does not claim that conflicts are absent while the first request is loading', () => {
    openSourceSync();
    expect(screen.queryByText(noConflictMessage)).not.toBeInTheDocument();
    expect(screen.queryByText('同步差异加载失败')).not.toBeInTheDocument();
  });

  it('shows an uncached failure without a simultaneous success message', () => {
    state.conflict.isError = true;
    state.conflict.isFetching = false;
    openSourceSync();
    expect(screen.getByText('同步差异加载失败')).toBeInTheDocument();
    expect(screen.queryByText(noConflictMessage)).not.toBeInTheDocument();
  });

  it('shows a successful empty result only after the request completes', () => {
    state.conflict.data = emptyConflict;
    state.conflict.isSuccess = true;
    state.conflict.isFetching = false;
    openSourceSync();
    expect(screen.getByText(noConflictMessage)).toBeInTheDocument();
    expect(screen.queryByText('同步差异加载失败')).not.toBeInTheDocument();
  });

  it('does not turn an unavailable successful result into an empty conflict list', () => {
    state.conflict.data = null;
    state.conflict.isSuccess = true;
    state.conflict.isFetching = false;
    openSourceSync();
    expect(screen.queryByText(noConflictMessage)).not.toBeInTheDocument();
  });

  it('does not reuse the cached empty-result message during a refresh', () => {
    state.conflict.data = emptyConflict;
    state.conflict.isSuccess = true;
    openSourceSync();
    expect(screen.queryByText(noConflictMessage)).not.toBeInTheDocument();
  });

  it('shows actual conflicts instead of a success message', () => {
    state.conflict.data = { ...emptyConflict, conflicts: [{ field: 'title', base: '原题', target: '本地修改', incoming: '来源修改' }] };
    state.conflict.isSuccess = true;
    state.conflict.isFetching = false;
    openSourceSync();
    expect(screen.getByText('"本地修改"')).toBeInTheDocument();
    expect(screen.getByText('"来源修改"')).toBeInTheDocument();
    expect(screen.queryByText(noConflictMessage)).not.toBeInTheDocument();
  });
});

describe('CMS feedback read states', () => {
  it('shows a spinner without a warning while an uncached letter is loading', () => {
    const view = render(<CmsFeedbackSheet id={8} onClose={() => undefined} />);
    expect(view.container.querySelector('.semi-spin-wrapper')).not.toBeNull();
    expect(view.container.querySelector('.semi-banner')).toBeNull();
    expect(screen.queryByText('正在加载来信')).not.toBeInTheDocument();
  });

  it('replaces the spinner with the real read failure', () => {
    const view = render(<CmsFeedbackSheet id={8} onClose={() => undefined} />);
    state.feedback.isLoading = false;
    state.feedback.isError = true;
    state.feedback.error = new Error('来信读取失败：服务暂不可用');
    view.rerender(<CmsFeedbackSheet id={8} onClose={() => undefined} />);
    expect(screen.getByText('来信读取失败：服务暂不可用')).toBeInTheDocument();
    expect(view.container.querySelector('.semi-spin-wrapper')).toBeNull();
    expect(screen.queryByText('正在加载来信')).not.toBeInTheDocument();
  });
});
