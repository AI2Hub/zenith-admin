import { useMemo, useState } from 'react';
import { Banner, Radio, RadioGroup, Select, Tag, Typography } from '@douyinfe/semi-ui';
import { CircleCheck, CircleSlash, ShieldCheck } from 'lucide-react';
import { judgeOperation, type OperationVerdict, type PermissionSubject } from '@zenith/shared/permission-catalog';
import { StatCard, StatGrid } from '@/components/charts/StatCard';
import UserSelect from '@/components/UserSelect';
import { FilterSelect } from '@/components/search-filters';
import { config } from '@/config';
import { useRolePermissionSets, useUserPermissionSet } from '@/hooks/queries/permission-matrix';
import { usePermission } from '@/hooks/usePermission';
import { usePinyinReady } from '@/hooks/usePinyinReady';
import { ApiCatalogFilterBar, ApiCatalogTable } from './ApiCatalogTable';
import ApiOperationSheet from './ApiOperationSheet';
import {
  EMPTY_FILTERS,
  VERDICT_LABELS,
  catalogRows,
  listPermissionRows,
  matchesCatalogFilters,
  type CatalogFilters,
  type CatalogRow,
} from './catalog-model';

type SubjectKind = 'role' | 'user';

const VERDICT_OPTIONS = (Object.keys(VERDICT_LABELS) as OperationVerdict[]).map((value) => ({ value, label: VERDICT_LABELS[value] }));

/**
 * 权限矩阵：选一个角色或用户，看它对每个后台接口的判定（可调用 / 无权限 / 仅平台超管）。
 * 判定在浏览器内用 judgeOperation 完成，与服务端门禁链同口径；服务端只给「主体持有哪些权限码」。
 */
export default function MatrixTab() {
  const { hasPermission } = usePermission();
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('role');
  const [roleId, setRoleId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<OperationVerdict | undefined>(undefined);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  usePinyinReady();

  const rolesQuery = useRolePermissionSets();
  const userQuery = useUserPermissionSet(subjectKind === 'user' ? userId : null);
  const roles = rolesQuery.data ?? [];
  const role = subjectKind === 'role' ? roles.find((r) => r.id === roleId) ?? null : null;
  const user = subjectKind === 'user' ? userQuery.data ?? null : null;

  const subject = useMemo<PermissionSubject | null>(() => {
    const source = role ?? user;
    if (!source) return null;
    return { permissions: new Set(source.permissions), superAdmin: source.superAdmin };
  }, [role, user]);

  // 矩阵只针对后台登录令牌操作：公开 / 会员 / 设备 / 网关接口不经权限码门禁
  const rows = useMemo(() => listPermissionRows(catalogRows()), []);
  const verdicts = useMemo(() => {
    if (!subject) return null;
    const map = new Map<string, OperationVerdict>();
    for (const row of rows) map.set(row.key, judgeOperation(row, subject, { multiTenant: config.multiTenantMode }));
    return map;
  }, [rows, subject]);

  const verdictOf = useMemo(() => (verdicts ? (row: CatalogRow) => verdicts.get(row.key) ?? 'denied' : undefined), [verdicts]);
  const filtered = rows.filter((row) => matchesCatalogFilters(row, filters) && (verdictFilter === undefined || verdictOf?.(row) === verdictFilter));

  const counts = useMemo(() => {
    const result: Record<OperationVerdict, number> = { allowed: 0, denied: 0, 'platform-only': 0 };
    if (verdicts) for (const verdict of verdicts.values()) result[verdict] += 1;
    return result;
  }, [verdicts]);

  const toggleVerdict = (verdict: OperationVerdict) => setVerdictFilter((prev) => (prev === verdict ? undefined : verdict));
  const canPickUser = hasPermission('system:user:list');

  const subjectPicker = (
    <>
      <RadioGroup type="button" value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value as SubjectKind); setVerdictFilter(undefined); }}>
        <Radio value="role">按角色</Radio>
        <Radio value="user">按用户</Radio>
      </RadioGroup>
      {subjectKind === 'role' ? (
        <Select
          placeholder="选择角色"
          filter
          showClear
          loading={rolesQuery.isPending}
          value={roleId ?? undefined}
          onChange={(v) => { setRoleId(typeof v === 'number' ? v : null); setVerdictFilter(undefined); }}
          optionList={roles.map((r) => ({ value: r.id, label: `${r.name}（${r.code}）` }))}
          style={{ width: 220 }}
        />
      ) : (
        <UserSelect
          placeholder="选择用户"
          showClear
          disabled={!canPickUser}
          value={userId ?? undefined}
          onChange={(v) => { setUserId(typeof v === 'number' ? v : null); setVerdictFilter(undefined); }}
          style={{ width: 220 }}
        />
      )}
    </>
  );

  const subjectSummary = role ?? user;

  return (
    <>
      {subjectKind === 'user' && !canPickUser && (
        <Banner type="info" closeIcon={null} description="按用户查看需要「用户管理 → 查询」权限以检索用户。" style={{ marginBottom: 12 }} />
      )}
      {subjectSummary && (
        <StatGrid minItemWidth={150} gap={12} style={{ marginBottom: 12 }}>
          <StatCard
            title={role ? '角色' : '用户'}
            value={role ? role.name : `${user?.nickname ?? ''}`}
            sub={(
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {subjectSummary.superAdmin
                  ? <Tag size="small" color="violet">平台超管 · 全部放行</Tag>
                  : <span>{subjectSummary.permissions.length} 个权限码</span>}
                {user?.roles.map((r) => <Tag key={r.id} size="small">{r.name}</Tag>)}
              </span>
            )}
          />
          <StatCard title="可调用" value={counts.allowed} icon={<CircleCheck size={16} />} accent="var(--semi-color-success)" onClick={() => toggleVerdict('allowed')} active={verdictFilter === 'allowed'} />
          <StatCard title="无权限" value={counts.denied} icon={<CircleSlash size={16} />} accent="var(--semi-color-danger)" onClick={() => toggleVerdict('denied')} active={verdictFilter === 'denied'} />
          <StatCard title="仅平台超管" value={counts['platform-only']} icon={<ShieldCheck size={16} />} accent="rgb(var(--semi-violet-5))" onClick={() => toggleVerdict('platform-only')} active={verdictFilter === 'platform-only'} />
        </StatGrid>
      )}

      <ApiCatalogFilterBar
        rows={rows}
        filters={filters}
        onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
        onReset={() => { setFilters(EMPTY_FILTERS); setVerdictFilter(undefined); }}
        primaryExtra={subjectPicker}
        extraFilters={verdictOf ? <FilterSelect placeholder="全部判定" items={VERDICT_OPTIONS} value={verdictFilter} onChange={setVerdictFilter} width={120} /> : undefined}
        extra={(
          <Typography.Text type="tertiary" size="small">
            {subject ? `匹配 ${filtered.length} / ${rows.length} 个后台接口` : '选择角色或用户后显示每个接口的判定结果'}
          </Typography.Text>
        )}
      />

      <ApiCatalogTable rows={filtered} onOpen={setSelected} verdictOf={verdictOf} heightOffset={subjectSummary ? 400 : 310} />
      <ApiOperationSheet row={selected} onClose={() => setSelected(null)} onOpen={setSelected} />
    </>
  );
}
