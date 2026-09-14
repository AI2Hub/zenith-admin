import { useMemo, useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Globe, Fingerprint, Layers } from 'lucide-react';
import { StatCard, StatGrid } from '@/components/charts/StatCard';
import { useListSearch } from '@/hooks/useListSearch';
import { usePinyinReady } from '@/hooks/usePinyinReady';
import { ApiCatalogSearchBar, ApiCatalogTable } from './ApiCatalogTable';
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

/** 目录是静态代码派生的数据，没有服务端 query；listKey 只用于满足 useListSearch 的失效契约与「记住筛选条件」偏好 */
const CATALOG_LIST_KEY = ['api-catalog', 'catalog'] as const;

/** 统计卡即筛选：点「需权限码」等于把认证方式 / 访问要求提交为对应值，再点一次取消 */
type StatKey = 'permission' | 'authenticated' | 'platform' | 'public' | 'otherCredential';
type StatFilter = Pick<CatalogFilters, 'security' | 'accessKind' | 'otherCredential'>;

const STAT_FILTERS: Record<StatKey, StatFilter> = {
  permission: { security: 'bearer', accessKind: 'permission', otherCredential: undefined },
  authenticated: { security: 'bearer', accessKind: 'authenticated', otherCredential: undefined },
  platform: { security: 'bearer', accessKind: 'platform', otherCredential: undefined },
  public: { security: 'none', accessKind: undefined, otherCredential: undefined },
  otherCredential: { security: undefined, accessKind: undefined, otherCredential: true },
};
const CLEARED_STAT_FILTER: StatFilter = { security: undefined, accessKind: undefined, otherCredential: undefined };

function activeStatOf(filters: CatalogFilters): StatKey | null {
  return (Object.keys(STAT_FILTERS) as StatKey[]).find((key) => {
    const spec = STAT_FILTERS[key];
    return filters.security === spec.security && filters.accessKind === spec.accessKind && filters.otherCredential === spec.otherCredential;
  }) ?? null;
}

export default function CatalogTab() {
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  // 词典就绪后重渲染：已提交的关键字补上拼音命中（过滤逐次渲染重算，~2,400 行仍是毫秒级）
  usePinyinReady();
  const search = useListSearch<CatalogFilters>({ defaults: EMPTY_FILTERS, listKey: CATALOG_LIST_KEY });
  const { submittedParams, applySearch, page, pageSize, buildPagination } = search;

  const rows = catalogRows();
  const stats = useMemo(() => summarizeCatalog(rows), [rows]);
  const filtered = rows.filter((row) => matchesCatalogFilters(row, submittedParams));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeStat = activeStatOf(submittedParams);
  const toggleStat = (key: StatKey) => {
    applySearch({ ...submittedParams, ...(activeStat === key ? CLEARED_STAT_FILTER : STAT_FILTERS[key]) });
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

      <ApiCatalogSearchBar
        rows={rows}
        search={search}
        extra={(
          <span style={{ color: 'var(--semi-color-text-2)', fontSize: 13 }}>
            {hasActiveFilter(submittedParams) ? `匹配 ${filtered.length} / ${rows.length} 个接口` : `共 ${rows.length} 个接口，由契约声明实时派生`}
          </span>
        )}
      />

      <ApiCatalogTable rows={pageRows} pagination={buildPagination(filtered.length)} onOpen={setSelected} />
      <ApiOperationSheet row={selected} onClose={() => setSelected(null)} onOpen={setSelected} />
    </>
  );
}
