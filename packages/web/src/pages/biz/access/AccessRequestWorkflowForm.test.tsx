import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowBusinessFormApi } from '@/components/workflow/BusinessFormHost';
import AccessRequestWorkflowForm from './AccessRequestWorkflowForm';

const options = { roles: [], menus: [{ id: 1011, parentId: 0, title: '查询用户', name: null, type: 'button', permission: 'system:user:list', permissionLabel: '查询用户', requestable: true, path: ['系统管理', '用户管理', '查询'], riskLevel: 'low', approvalPolicy: 'manager', maxDurationMinutes: null, mfaRequired: false, permanentAllowed: true, emergencyAllowed: true, maxEmergencyMinutes: 60 }] };
vi.mock('@tanstack/react-pacer', () => ({ useDebouncedValue: (value: unknown) => [value] }));
vi.mock('@/hooks/queries/identity-access-governance', () => ({ useAccessWorkflowOptions: () => ({ data: options, isSuccess: true, isLoading: false, error: null }), useAccessWorkflowPreview: () => ({ data: { status: 'ready', fingerprint: 'evaluated-plan', permissionCount: 1, grantItemCount: 1, approvalPlan: { steps: [] } }, isFetching: false, error: null }) }));
vi.mock('@/hooks/usePinyinReady', () => ({ usePinyinReady: () => undefined }));

async function mountForm(values: Record<string, unknown>) {
  let api: WorkflowBusinessFormApi | undefined;
  render(<AccessRequestWorkflowForm mode="create" container="sheet" definitionId={5} value={{ requestType: 'temporary', roleSelections: [], permissionCodes: ['system:user:list'], reason: '本次回归核对日期组件和永久有效语义', startMode: 'immediate', validityMode: 'limited', expiresAt: '2030-01-01 12:00:00', ...values }} getFormApi={next => { api = next; }} />);
  await waitFor(() => expect(api).toBeDefined());
  return api!;
}

describe('access request date controls and explicit permanent validity', () => {
  it('restores selected permissions and draft dates without imposing an eight-hour limit', async () => {
    const api = await mountForm({});
    const values = await api.validate();
    expect(values).toMatchObject({ permissionCodes: ['system:user:list'], previewFingerprint: 'evaluated-plan', validityMode: 'limited', expiresAt: '2030-01-01 12:00:00' });
  });

  it('accepts the formatted string emitted by a date-time control after user editing', async () => {
    const api = await mountForm({});
    const expiry = screen.getByPlaceholderText('请选择日期及时间');
    fireEvent.change(expiry, { target: { value: '2031-01-02 10:30:00' } });
    fireEvent.keyDown(expiry, { key: 'Enter', code: 'Enter', keyCode: 13 });
    fireEvent.blur(expiry);
    await waitFor(() => expect(api.getValues?.().expiresAt).toBe('2031-01-02 10:30:00'));
    expect(await api.validate()).toMatchObject({ expiresAt: '2031-01-02 10:30:00' });
  });

  it('does not require or submit an expiry for permanent access', async () => {
    const api = await mountForm({});
    fireEvent.click(screen.getByRole('radio', { name: '永久有效' }));
    await waitFor(() => expect(screen.queryByPlaceholderText('请选择日期及时间')).not.toBeInTheDocument());
    expect(screen.getByRole('radio', { name: '常规授权' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '审批通过后立即生效' })).toBeChecked();
    expect(await api.validate()).toMatchObject({ validityMode: 'permanent', expiresAt: null });
  });

  it('keeps scheduled start and expiry times when reopening a draft', async () => {
    const api = await mountForm({ startMode: 'scheduled', startsAt: '2030-01-01 09:30:00', expiresAt: '2030-01-02 11:00:00' });
    expect(await api.validate()).toMatchObject({ startMode: 'scheduled', startsAt: '2030-01-01 09:30:00', expiresAt: '2030-01-02 11:00:00' });
  });
});
