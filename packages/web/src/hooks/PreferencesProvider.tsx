import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebouncer } from '@tanstack/react-pacer';
import { PREFERENCES_KEY } from '@zenith/shared/core';
import { authContract } from '@zenith/shared/identity';
import { api } from '@/lib/contract-query';
import { applyWeekStart } from '@/lib/week-start';
import { defaultPreferences, isLoadingStyle, PreferencesContext } from './usePreferences';
import type { UserPreferences } from './usePreferences';

/**
 * 必须先于子树渲染生效的偏好（React 在 createElement 时解析 class defaultProps，
 * 放进 useEffect 会让本轮已渲染的选择器停在旧值）。写状态之前同步调用；
 * DatePicker 模块尚未加载时由 applyWeekStart 在其加载完成、任何选择器渲染之前写入。
 */
function applyPreRenderPreferences(prefs: UserPreferences) {
  void applyWeekStart(prefs.weekStart);
}

function mergePreferences(raw: unknown): UserPreferences {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<UserPreferences>
    : {};
  const merged = { ...defaultPreferences, ...source };
  if (!isLoadingStyle(merged.loadingStyle)) {
    merged.loadingStyle = defaultPreferences.loadingStyle;
  }
  return merged;
}

function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (raw) {
      return mergePreferences(JSON.parse(raw));
    }
  } catch { /* ignore */ }
  return { ...defaultPreferences };
}

function savePreferences(prefs: UserPreferences) {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    const base = raw ? JSON.parse(raw) : {};
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...base, ...prefs }));
  } catch {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  }
}

export function PreferencesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const initial = loadPreferences();
    applyPreRenderPreferences(initial);
    return initial;
  });
  const [ready, setReady] = useState(false);
  const prefsRef = useRef(prefs);
  const queryClient = useQueryClient();

  // 切回窗口 / 页签时是否重取过期数据：改 QueryClient 默认项，对后续挂载的 query 生效；
  // 显式声明了 refetchOnWindowFocus 的 query（如登录态）不受影响
  useEffect(() => {
    const current = queryClient.getDefaultOptions();
    queryClient.setDefaultOptions({
      ...current,
      queries: { ...current.queries, refetchOnWindowFocus: prefs.refetchOnFocus },
    });
  }, [queryClient, prefs.refetchOnFocus]);

  const applyLocalPreferences = useCallback((next: UserPreferences, persist = true) => {
    prefsRef.current = next;
    applyPreRenderPreferences(next);
    setPrefs(next);
    if (persist) savePreferences(next);
  }, []);

  const putPreferences = useCallback((next: UserPreferences) => {
    api(authContract.savePreferences, { body: { ...next } }, { silent: true }).catch(() => { /* ignore */ });
  }, []);

  const syncDebouncer = useDebouncer(putPreferences, { wait: 500 });

  const scheduleSync = useCallback((next: UserPreferences) => {
    syncDebouncer.maybeExecute(next);
  }, [syncDebouncer]);

  const syncNow = useCallback((next: UserPreferences) => {
    syncDebouncer.cancel();
    putPreferences(next);
  }, [syncDebouncer, putPreferences]);

  // 组件挂载时（用户已登录）从服务器拉取偏好，覆盖本地缓存
  useEffect(() => {
    let cancelled = false;
    api(authContract.preferences, { silent: true })
      .then((data) => {
        if (cancelled) return;
        if (data) {
          const merged = mergePreferences(data);
          applyLocalPreferences(merged);
          return;
        }
        // 老用户服务器端暂无偏好时，把本地缓存迁移到服务器。
        scheduleSync(prefsRef.current);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [applyLocalPreferences, scheduleSync]);

  const setPreferences = useCallback((partial: Partial<UserPreferences>) => {
    const next = { ...prefsRef.current, ...partial };
    applyLocalPreferences(next);
    scheduleSync(next);
  }, [applyLocalPreferences, scheduleSync]);

  const resetPreferences = useCallback(() => {
    const next = { ...defaultPreferences };
    localStorage.removeItem(PREFERENCES_KEY);
    applyLocalPreferences(next, false);
    syncNow(next);
  }, [applyLocalPreferences, syncNow]);

  const value = useMemo(
    () => ({ preferences: prefs, setPreferences, resetPreferences, ready }),
    [prefs, setPreferences, resetPreferences, ready],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
