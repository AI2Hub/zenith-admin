import { useMemo, useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Globe, Fingerprint, Layers } from 'lucide-react';
import { StatCard, StatGrid } from '@/components/charts/StatCard';
import { usePinyinReady } from '@/hooks/usePinyinReady';
import { ApiCatalogFilterBar, ApiCatalogTable } from './ApiCatalogTable';
import ApiOperationSheet from './ApiOperationSheet';
import {
  EMPTY_FILTERS,
  catalogRows,
  hasActiveFilter,
  matchesCatalogFilters,
  summarizeCatalog,
  type CatalogFilters,
  type CatalogRow,
} from './catalog-model';

/** 统计卡即筛选：点「需权限码」等于把访问要求 / 认证方式筛到对应值，再点一次取消 */
type StatKey = 'permission' | 'authenticated' | 'platform' | 'public' | 'otherCredential';

const STAT_FILTERS: Record<StatKey, Partial<CatalogFilters>> = {
  permission: { accessKind: 'permission', security: 'bearer' },
  authenticated: { accessKind: 'authenticated', security: 'bearer' },
  platform: { accessKind: 'platform', security: 'bearer' },
  public: { security: 'none', accessKind: undefined },
  otherCredential: { security: undefined, accessKind: undefined },
};

export default function CatalogTab() {
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [activeStat, setActiveStat] = useState<StatKey | null>(null);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  // 词典就绪后重渲染：已输入的关键字补上拼音命中（过滤逐次渲染重算，候选 ~2,400 行仍是毫秒级）
  usePinyinReady();

  const rows = catalogRows();
  const stats = useMemo(() => summarizeCatalog(rows), [rows]);
  const filtered = rows.filter((row) => {
    if (activeStat === 'otherCredential' && (row.security === 'bearer' || row.security === 'none')) return false;
    return matchesCatalogFilters(row, filters);
  });

  const patch = (next: Partial<CatalogFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    // 手动改了认证 / 访问要求下拉，统计卡的选中态不再代表当前筛选
    if ('security' in next || 'accessKind' in next) setActiveStat(null);
  };
  const reset = () => { setFilters(EMPTY_FILTERS); setActiveStat(null); };
  const toggleStat = (key: StatKey) => {
    if (activeStat === key) {
      setActiveStat(null);
      setFilters((prev) => ({ ...prev, security: undefined, accessKind: undefined }));
      return;
    }
    setActiveStat(key);
    setFilters((prev) => ({ ...prev, ...STAT_FILTERS[key] }));
  };

  return (
    <>
      <StatGrid minItemWidth={150} gap={12} style={{ marginBottom: 12 }}>
        <StatCard title="全部接口" value={stats.total} icon={<Layers size={16} />} />
        <StatCard title="需权限码" value={stats.permission} icon={<KeyRound size={16} />} accent="var(--semi-color-primary)" onClick={() => toggleStat('permission')} active={activeStat === 'permission'} />
        <StatCard title="登录即可" value={stats.authenticated} icon={<Lock size={16} />} onClick={() => toggleStat('authenticated')} active={activeStat === 'authenticated'} />
        <StatCard title="仅平台超管" value={stats.platform} icon={<ShieldCheck size={16} />} accent="rgb(var(--semi-violet-5))" onClick={() => toggleStat('platform')} active={activeStat === 'platform'} />
        <StatCard title="公开接口" value={stats.public} icon={<Globe size={16} />} accent="var(--semi-color-warning)" onClick={() => toggleStat('public')} active={activeStat === 'public'} />
        <StatCard title="其他凭证" value={stats.otherCredential} sub="会员令牌 / 设备签名 / 开放网关" icon={<Fingerprint size={16} />} onClick={() => toggleStat('otherCredential')} active={activeStat === 'otherCredential'} />
      </StatGrid>

      <ApiCatalogFilterBar
        rows={rows}
        filters={filters}
        onChange={patch}
        onReset={reset}
        extra={<span style={{ color: 'var(--semi-color-text-2)', fontSize: 13 }}>{hasActiveFilter(filters) || activeStat ? `匹配 ${filtered.length} / ${rows.length} 个接口` : `共 ${rows.length} 个接口，由契约声明实时派生`}</span>}
      />

      <ApiCatalogTable rows={filtered} onOpen={setSelected} heightOffset={400} />
      <ApiOperationSheet row={selected} onClose={() => setSelected(null)} onOpen={setSelected} />
    </>
  );
}
