import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';
import { Modal, Toast } from '@douyinfe/semi-ui';
import {
  SETTINGS_MODULES, mergeSettingsLayers, removeSettingsOverride, setSettingsOverride,
  settingsOverriddenPaths, stableSettingsSerialize,
  type SettingsDoc, type SettingsEnvelope, type SettingsModuleKey, type SettingsOf, type SettingsWriteBody,
} from '@zenith/shared/settings';
import { registerLaunchLeaveGuard } from '@/components/workflow/useLaunchLeaveGuard';
import { ApiError } from '@/lib/query';

interface Draft<M extends SettingsModuleKey> {
  base: SettingsEnvelope<M>;
  overrides: SettingsDoc;
}
const EMPTY_OVERRIDES: SettingsDoc = {};

/**
 * 编辑时固定本层、上级和定义的基线；后台查询更新只提示，不重置草稿。
 * 覆盖关系是独立状态：把值改成上级值也保留覆盖，只有 revert 才恢复继承。
 */
export function useSettingsEditor<M extends SettingsModuleKey>(module: M, envelope: SettingsEnvelope<M> | undefined) {
  const [draft, setDraft] = useState<Draft<M> | null>(null);
  const [conflict, setConflict] = useState(false);
  const [note, setNote] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const base = draft?.base ?? envelope;
  const overrides = draft?.overrides ?? envelope?.overrides ?? EMPTY_OVERRIDES;
  const value = useMemo(() => base
    ? mergeSettingsLayers(base.inherited as SettingsDoc, overrides) as SettingsOf<M>
    : SETTINGS_MODULES[module].schema.parse({}) as SettingsOf<M>, [base, module, overrides]);
  const dirty = draft !== null && stableSettingsSerialize(draft.overrides) !== stableSettingsSerialize(draft.base.overrides);
  const stale = dirty && base?.baseToken !== envelope?.baseToken;
  const overriddenPaths = settingsOverriddenPaths(overrides);
  const state = useRef({ draft, envelope, dirty });
  state.current = { draft, envelope, dirty };

  const edit = (update: (current: SettingsDoc) => SettingsDoc) => {
    setDraft((current) => {
      const nextBase = current?.base ?? envelope;
      if (!nextBase) return current;
      const next = update(current?.overrides ?? nextBase.overrides);
      return stableSettingsSerialize(next) === stableSettingsSerialize(nextBase.overrides) ? null : { base: nextBase, overrides: next };
    });
  };
  const setField = (path: string, next: unknown) => edit((current) => setSettingsOverride(current, path, next));
  const setFields = (changes: SettingsDoc) => edit((current) => {
    let next = current;
    // Semi 单字段事件使用 "password.minLength" 这样的平面路径；setValues 则可能给嵌套对象。
    const visit = (fields: SettingsDoc, prefix = '') => {
      for (const [key, field] of Object.entries(fields)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (field !== null && typeof field === 'object' && !Array.isArray(field)) visit(field as SettingsDoc, path);
        else next = setSettingsOverride(next, path, field);
      }
    };
    visit(changes);
    return next;
  });
  const revert = (path: string) => { edit((current) => removeSettingsOverride(current, path)); setResetKey((key) => key + 1); };
  const discard = () => { setDraft(null); setConflict(false); setNote(''); setResetKey((key) => key + 1); };
  const acceptSaved = (saved: SettingsEnvelope<M>, submitted: Draft<M> | null) => {
    setDraft((current) => current === submitted ? null : current ? { ...current, base: saved } : null);
    setConflict(false);
    setNote('');
  };
  const save = async (persist: (body: SettingsWriteBody<M>) => Promise<SettingsEnvelope<M>>) => {
    if (!base || !dirty) return false;
    const parsed = SETTINGS_MODULES[module].schema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      Toast.error(`${issue.path.join('.') || '表单'}：${issue.message}`);
      return false;
    }
    const submitted = draft;
    try {
      const saved = await persist({ baseToken: base.baseToken, overrides, ...(note.trim() ? { note: note.trim() } : {}) });
      acceptSaved(saved, submitted);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 409) setConflict(true);
      // 请求层已经提示具体错误；草稿、原始并发基线和说明均保留。
      return false;
    }
  };

  const { navigator } = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const confirming = useRef(false);
  const confirmLeave = useCallback((action: () => void) => {
    if (!state.current.dirty) { action(); return; }
    if (confirming.current) return;
    confirming.current = true;
    Modal.confirm({
      title: '放弃未保存的设置？',
      content: '离开后当前修改将丢失，已保存的版本不受影响。',
      okText: '放弃并离开', cancelText: '继续编辑',
      onCancel: () => { confirming.current = false; },
      onOk: () => { confirming.current = false; action(); },
    });
  }, []);
  useEffect(() => registerLaunchLeaveGuard(navigator, {
    pathname: location.pathname,
    activePathname: () => locationRef.current.pathname,
    // 同页切换设置模块也会卸载编辑器；其它 Tab 的草稿保留在当前页面组件内。
    protectSamePage: (to) => {
      const target = typeof to === 'string' ? new URL(to, window.location.href).search : to.search ?? '';
      return new URLSearchParams(target).get('module') !== new URLSearchParams(locationRef.current.search).get('module');
    },
    shouldWarnBeforeUnload: () => state.current.dirty,
    confirmLeave,
  }), [confirmLeave, location.pathname, navigator]);

  return {
    value, base, overrides, overriddenPaths, dirty, stale, conflict, note, setNote,
    setField, setFields, revert, revertAll: () => { edit(() => ({})); setResetKey((key) => key + 1); },
    discard, save, resetKey, confirmLeave,
  };
}
