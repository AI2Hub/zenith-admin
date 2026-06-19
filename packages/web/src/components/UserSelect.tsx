import { useEffect, useState } from 'react';
import { Select } from '@douyinfe/semi-ui';
import type { CSSProperties } from 'react';
import type { User } from '@zenith/shared';
import { request } from '@/utils/request';

interface UserOption {
  id: number;
  nickname: string;
  departmentName?: string | null;
}

let cache: UserOption[] | null = null;
let inflight: Promise<UserOption[]> | null = null;

async function loadUsers(): Promise<UserOption[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = request
      .get<User[]>('/api/users/all', { silent: true })
      .then((res) => {
        const list = res.code === 0 && res.data
          ? res.data.map((u) => ({ id: u.id, nickname: u.nickname, departmentName: u.departmentName ?? null }))
          : [];
        cache = list;
        return list;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export interface UserSelectProps {
  value?: number | number[];
  onChange?: (value: number | number[] | undefined) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  showClear?: boolean;
  style?: CSSProperties;
}

/**
 * 用户选择器 — 与系统用户体系集成，从 /api/users/all 拉取人员列表。
 * 支持单选 / 多选，可直接用于 Semi Form（withField 包裹）。
 */
export default function UserSelect({
  value,
  onChange,
  multiple = false,
  placeholder = '请选择人员',
  disabled = false,
  showClear = true,
  style,
}: Readonly<UserSelectProps>) {
  const [options, setOptions] = useState<UserOption[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) { setOptions(cache); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    loadUsers().then((list) => {
      if (!cancelled) { setOptions(list); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <Select
      value={value as never}
      onChange={(v) => onChange?.(v as number | number[] | undefined)}
      multiple={multiple}
      filter
      placeholder={loading ? '加载中...' : placeholder}
      disabled={disabled || loading}
      showClear={showClear}
      maxTagCount={3}
      style={{ width: '100%', ...style }}
      optionList={options.map((u) => ({
        value: u.id,
        label: u.departmentName ? `${u.nickname}（${u.departmentName}）` : u.nickname,
      }))}
    />
  );
}
