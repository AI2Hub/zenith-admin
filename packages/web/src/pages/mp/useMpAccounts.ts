import { useState, useEffect, useCallback, useRef } from 'react';
import { request } from '@/utils/request';
import type { MpAccount, PaginatedResponse } from '@zenith/shared';

const STORAGE_KEY = 'mp_current_account';

/**
 * 公众号管理模块共享 hook：加载公众号列表 + 维护「当前公众号」选择（localStorage 持久化，跨页面共享）。
 * 额外暴露 `currentIdRef`：供页面在异步请求返回后判断账号是否已切换，丢弃过期响应（防止账号 A 的数据渲染到账号 B）。
 */
export function useMpAccounts() {
  const [accounts, setAccounts] = useState<MpAccount[]>([]);
  const [currentId, setCurrentIdState] = useState<number | null>(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  });
  const [loading, setLoading] = useState(false);

  // 始终指向最新 currentId，供异步回调比对
  const currentIdRef = useRef<number | null>(currentId);
  currentIdRef.current = currentId;

  const setCurrentId = useCallback((id: number | null) => {
    setCurrentIdState(id);
    if (id == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    request.get<PaginatedResponse<MpAccount>>('/api/mp/accounts?page=1&pageSize=100')
      .then((res) => {
        if (!active) return;
        const list = res.data?.list ?? [];
        setAccounts(list);
        const stored = localStorage.getItem(STORAGE_KEY);
        const storedId = stored ? Number(stored) : null;
        if (storedId && list.some((a) => a.id === storedId)) {
          setCurrentIdState(storedId);
        } else {
          const pick = (list.find((a) => a.isDefault) ?? list[0])?.id ?? null;
          setCurrentId(pick);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { accounts, currentId, currentIdRef, setCurrentId, loading };
}
