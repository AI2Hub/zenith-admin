import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_MODULES, mergeSettingsLayers, settingsOverriddenPaths,
  type SettingsDoc, type SettingsEnvelope, type SettingsModuleKey, type SettingsOf,
} from '@zenith/shared/settings';
import { ApiError } from '@/lib/query';
import { useSettingsEditor } from './useSettingsEditor';

vi.mock('@douyinfe/semi-ui', () => ({ Modal: { confirm: vi.fn() }, Toast: { error: vi.fn() } }));

function envelope<M extends SettingsModuleKey>(module: M, version = 1, overrides: SettingsDoc = {}, inherited?: SettingsOf<M>): SettingsEnvelope<M> {
  const base = inherited ?? SETTINGS_MODULES[module].schema.parse({}) as SettingsOf<M>;
  return {
    module, version, scope: SETTINGS_MODULES[module].scope, tenantId: null,
    baseToken: `version-${version}`, currentRevisionId: version, inheritedVersion: 0,
    definitionHash: 'definition', overrides, overriddenPaths: settingsOverriddenPaths(overrides),
    updatedAt: '2026-10-14T00:00:00.000Z', inherited: base,
    effective: mergeSettingsLayers(base as SettingsDoc, overrides) as SettingsOf<M>,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/system/settings?module=files']}>{children}</MemoryRouter>;
}

beforeEach(() => vi.clearAllMocks());

describe('系统设置编辑草稿', () => {
  it('显式设置为上级相同值仍是覆盖，恢复继承才移除路径', () => {
    const initial = envelope('files');
    const { result } = renderHook(() => useSettingsEditor('files', initial), { wrapper });
    act(() => result.current.setField('uploadMaxSizeMb', initial.inherited.uploadMaxSizeMb));
    expect(result.current.dirty).toBe(true);
    expect(result.current.overriddenPaths).toEqual(['uploadMaxSizeMb']);
    act(() => result.current.revert('uploadMaxSizeMb'));
    expect(result.current.dirty).toBe(false);
    expect(result.current.overrides).toEqual({});
  });

  it('后台更新不会覆盖草稿或替换保存使用的并发基线', async () => {
    const initial = envelope('files');
    const newer = envelope('files', 2, { uploadMaxSizeMb: 999 });
    const { result, rerender } = renderHook(({ current }) => useSettingsEditor('files', current), { wrapper, initialProps: { current: initial } });
    act(() => result.current.setField('uploadMaxSizeMb', 40));
    rerender({ current: newer });
    expect(result.current.value.uploadMaxSizeMb).toBe(40);
    expect(result.current.base?.version).toBe(1);
    expect(result.current.stale).toBe(true);
    const persist = vi.fn().mockRejectedValue(new ApiError(409, '配置已更新'));
    await act(async () => { expect(await result.current.save(persist)).toBe(false); });
    expect(persist).toHaveBeenCalledWith({ baseToken: 'version-1', overrides: { uploadMaxSizeMb: 40 } });
    expect(result.current.conflict).toBe(true);
    expect(result.current.dirty).toBe(true);
    expect(result.current.value.uploadMaxSizeMb).toBe(40);
    act(() => result.current.discard());
    expect(result.current.value.uploadMaxSizeMb).toBe(999);
    expect(result.current.base?.version).toBe(2);
    expect(result.current.conflict).toBe(false);
  });

  it('上级版本变化时保留编辑时继承值，明确重载后才使用新上级', () => {
    const initial = envelope('files', 1, { chunkSizeMb: 8 });
    const latest = { ...envelope('files', 1, { chunkSizeMb: 8 }, { ...initial.inherited, uploadMaxSizeMb: 500 }), baseToken: 'new-parent', inheritedVersion: 2 };
    const { result, rerender } = renderHook(({ current }) => useSettingsEditor('files', current), { wrapper, initialProps: { current: initial } });
    act(() => result.current.setField('chunkSizeMb', 16));
    rerender({ current: latest });
    expect(result.current.value.uploadMaxSizeMb).toBe(initial.inherited.uploadMaxSizeMb);
    expect(result.current.stale).toBe(true);
    act(() => result.current.discard());
    expect(result.current.value.uploadMaxSizeMb).toBe(500);
  });

  it('Semi 的平面字段路径与嵌套批量修改均只写已修改的叶子', () => {
    const initial = envelope('identitySecurity');
    const { result } = renderHook(() => useSettingsEditor('identitySecurity', initial), { wrapper });
    act(() => result.current.setFields({ 'password.minLength': 16 }));
    act(() => result.current.setFields({ mfa: { mode: 'required' } }));
    expect(result.current.overrides).toEqual({ password: { minLength: 16 }, mfa: { mode: 'required' } });
    expect(result.current.value.password.requireUppercase).toBe(initial.inherited.password.requireUppercase);
    act(() => result.current.revert('password.minLength'));
    expect(result.current.overrides).toEqual({ mfa: { mode: 'required' } });
  });

  it('保存失败保留草稿和说明，成功后清理已提交的草稿', async () => {
    const initial = envelope('files');
    const { result } = renderHook(() => useSettingsEditor('files', initial), { wrapper });
    act(() => { result.current.setField('uploadMaxSizeMb', 80); result.current.setNote(' 提升上传限制 '); });
    await act(async () => { await result.current.save(vi.fn().mockRejectedValue(new Error('网络失败'))); });
    expect(result.current.note).toBe(' 提升上传限制 ');
    expect(result.current.dirty).toBe(true);
    const persist = vi.fn().mockResolvedValue(envelope('files', 2, { uploadMaxSizeMb: 80 }));
    await act(async () => { expect(await result.current.save(persist)).toBe(true); });
    expect(persist).toHaveBeenCalledWith({ baseToken: 'version-1', overrides: { uploadMaxSizeMb: 80 }, note: '提升上传限制' });
    expect(result.current.dirty).toBe(false);
    expect(result.current.note).toBe('');
  });

  it('保存请求在途时新发生的编辑不会被保存结果清空', async () => {
    const initial = envelope('files');
    const { result } = renderHook(() => useSettingsEditor('files', initial), { wrapper });
    act(() => result.current.setField('uploadMaxSizeMb', 80));
    let finish!: (saved: SettingsEnvelope<'files'>) => void;
    const pending = new Promise<SettingsEnvelope<'files'>>((resolve) => { finish = resolve; });
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.save(() => pending); });
    act(() => result.current.setField('uploadMaxSizeMb', 100));
    await act(async () => { finish(envelope('files', 2, { uploadMaxSizeMb: 80 })); await saving; });
    expect(result.current.dirty).toBe(true);
    expect(result.current.value.uploadMaxSizeMb).toBe(100);
    expect(result.current.base?.version).toBe(2);
  });
});
