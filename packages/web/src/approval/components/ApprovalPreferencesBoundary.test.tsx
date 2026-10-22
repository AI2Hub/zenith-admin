import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@zenith/shared/core';
import { authContract } from '@zenith/shared/identity';
import { preferencePolicySchema } from '@zenith/shared/preferences';
import { settingsProjectionContract } from '@zenith/shared/settings/projections';
import { contractKey } from '@/lib/contract-query';
import { createTestQueryClient, createWrapper } from '@/test-utils/query-harness';

const requests = vi.hoisted(() => ({ approval: vi.fn(), admin: vi.fn() }));
vi.mock('../lib/approval-request', () => ({ approvalRequest: { get: requests.approval } }));
vi.mock('@/utils/request', () => ({ request: { get: requests.admin } }));
vi.mock('../pages/LoginPage', () => ({ default: () => <div>审批登录</div> }));
vi.mock('../pages/TaskListPage', () => ({ default: () => <div>审批工作台</div> }));
vi.mock('../pages/TaskDetailPage', () => ({ default: () => null }));
vi.mock('../pages/LaunchListPage', () => ({ default: () => null }));
vi.mock('../pages/LaunchFormPage', () => ({ default: () => null }));

import ApprovalApp from '../App-approval';
import { approvalQueryClient } from '../lib/query-client';
import { ApprovalPreferencesBoundary } from './ApprovalPreferencesBoundary';

const response = (data: unknown) => ({ code: 0, message: 'success', data });
let policy = preferencePolicySchema.parse({});

function setup() {
  const client = createTestQueryClient();
  const view = render(<ApprovalPreferencesBoundary>审批表单</ApprovalPreferencesBoundary>, { wrapper: createWrapper(client) });
  return { client, ...view };
}

beforeEach(() => {
  requests.approval.mockReset();
  requests.admin.mockReset();
  localStorage.clear();
  window.location.hash = '#/';
  policy = preferencePolicySchema.parse({});
  requests.approval.mockImplementation(async (url: string) => response(
    url === authContract.preferences.fullPath
      ? { overrides: { multiSelectLayout: 'wrap' } }
      : { ui: { preferences: policy } },
  ));
});

afterEach(() => {
  cleanup();
  approvalQueryClient.clear();
  delete document.body.dataset.multiSelectLayout;
});

describe('ApprovalPreferencesBoundary', () => {
  it('uses the approval client for both requests and applies the saved personal layout', async () => {
    const { unmount } = setup();
    expect(document.body.dataset.multiSelectLayout).toBe('single-line');
    await waitFor(() => expect(document.body.dataset.multiSelectLayout).toBe('wrap'));
    expect(requests.approval.mock.calls.map(([url]) => url).sort()).toEqual([
      authContract.preferences.fullPath, settingsProjectionContract.me.fullPath,
    ].sort());
    expect(requests.approval).toHaveBeenCalledWith(authContract.preferences.fullPath, { silent: true });
    expect(requests.admin).not.toHaveBeenCalled();
    unmount();
    expect(document.body.dataset.multiSelectLayout).toBeUndefined();
  });

  it('starts both requests together and waits for policy before using personal overrides', async () => {
    let finishPolicy!: (value: unknown) => void;
    const pendingPolicy = new Promise((resolve) => { finishPolicy = resolve; });
    requests.approval.mockImplementation((url: string) => url === authContract.preferences.fullPath
      ? Promise.resolve(response({ overrides: { multiSelectLayout: 'wrap' } }))
      : pendingPolicy);
    const { client } = setup();
    await waitFor(() => expect(client.getQueryData(contractKey(authContract.preferences))).toBeDefined());
    expect(requests.approval).toHaveBeenCalledTimes(2);
    expect(document.body.dataset.multiSelectLayout).toBe('single-line');
    await act(async () => { finishPolicy(response({ ui: { preferences: policy } })); });
    await waitFor(() => expect(document.body.dataset.multiSelectLayout).toBe('wrap'));
  });

  it('honors a system lock and refreshes the layout when the policy changes', async () => {
    policy.allowUserOverride.multiSelectLayout = false;
    const { client } = setup();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(document.body.dataset.multiSelectLayout).toBe('single-line');
    policy = { ...policy, allowUserOverride: { ...policy.allowUserOverride, multiSelectLayout: true } };
    await act(async () => { await client.invalidateQueries({ queryKey: contractKey(settingsProjectionContract.me) }); });
    await waitFor(() => expect(document.body.dataset.multiSelectLayout).toBe('wrap'));
  });

  it('falls back to the shared default when the requests fail', async () => {
    requests.approval.mockRejectedValue(new Error('offline'));
    const { client } = setup();
    await waitFor(() => expect(client.getQueryState(contractKey(settingsProjectionContract.me))?.status).toBe('error'));
    expect(document.body.dataset.multiSelectLayout).toBe('single-line');
    expect(requests.approval).toHaveBeenCalledTimes(2);
  });

  it('uses the system default when only personal preferences fail', async () => {
    policy.defaults.multiSelectLayout = 'wrap';
    requests.approval.mockImplementation(async (url: string) => {
      if (url === authContract.preferences.fullPath) throw new Error('offline');
      return response({ ui: { preferences: policy } });
    });
    setup();
    await waitFor(() => expect(document.body.dataset.multiSelectLayout).toBe('wrap'));
  });

  it('does not fetch preferences or apply a body marker on the login route', async () => {
    render(<ApprovalApp />);
    expect(await screen.findByText('审批登录')).toBeTruthy();
    expect(requests.approval).not.toHaveBeenCalled();
    expect(document.body.dataset.multiSelectLayout).toBeUndefined();
  });

  it('cleans up the body marker and cached preference data when leaving authenticated routes', async () => {
    localStorage.setItem(TOKEN_KEY, 'approval-test-token');
    render(<ApprovalApp />);
    expect(await screen.findByText('审批工作台')).toBeTruthy();
    await waitFor(() => expect(document.body.dataset.multiSelectLayout).toBe('wrap'));
    await act(async () => {
      localStorage.removeItem(TOKEN_KEY);
      window.location.hash = '#/login';
    });
    expect(await screen.findByText('审批登录')).toBeTruthy();
    expect(document.body.dataset.multiSelectLayout).toBeUndefined();
    await waitFor(() => expect(approvalQueryClient.getQueryData(contractKey(authContract.preferences))).toBeUndefined());
  });
});
