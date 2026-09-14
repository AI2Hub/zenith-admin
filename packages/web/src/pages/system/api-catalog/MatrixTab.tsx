import { useMemo, useState } from 'react';
import { Banner, Radio, RadioGroup, Select, Tag, Typography } from '@douyinfe/semi-ui';
import { CircleCheck, CircleSlash, ShieldCheck } from 'lucide-react';
import { judgeOperation, type OperationVerdict, type PermissionSubject } from '@zenith/shared/permission-catalog';
import { StatCard, StatGrid } from '@/components/charts/StatCard';
import UserSelect from '@/components/UserSelect';
import { FilterSelect } from '@/components/search-filters';
import { config } from '@/config';
import { useRolePermissionSets, useUserPermissionSet } from '@/hooks/queries/permission-matrix';
import { useListSearch } from '@/hooks/useListSearch';
import { usePermission } from '@/hooks/usePermission';
import { usePinyinReady } from '@/hooks/usePinyinReady';
import { ApiCatalogSearchBar, ApiCatalogTable } from './ApiCatalogTable';
import ApiOperationSheet from './ApiOperationSheet';
import {
  EMPTY_MATRIX_FILTERS,
  VERDICT_LABELS,
  catalogRows,
  listPermissionRows,
  matchesCatalogFilters,
  type CatalogRow,
  type MatrixFilters,
} from './catalog-model';

type SubjectKind = 'role' | 'user';

const MATRIX_LIST_KEY = ['api-catalog', 'matrix'] as const;
const VERDICT_OPTIONS = (Object.keys(VERDICT_LABELS) as OperationVerdict[]).map((value) => ({ value, label: VERDICT_LABELS[value] }));

/**
 * 权限矩阵：选一个角色或用户，看它对后台接口的判定。选中主体后默认只列「可调用」的接口，
 * 统计卡 / 判定筛选切到「无权限」「仅平台超管」或全部。
 * 判定在浏览器内用 judgeOperation 完成，与服务端门禁链同口径；服务端只给「主体持有哪些权限码」。
 */
export default function MatrixTab() {
  const { hasPermission } = usePermission();
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('role');
  const [roleId, setRoleId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  usePinyinReady();

  const rolesQuery = useRolePermissionSets();
  const userQuery = useUserPermissionSet(subjectKind === 'user' ? userId : null);
  const roles = rolesQuery.data ?? [];
  const role = subjectKind === 'role' ? roles.find((r) => r.id === roleId) ?? null : null;
  const user = subjectKind === 'user' ? userQuery.data ?? null : null;
  const subjectSummary = role ?? user;

  // 主体切换回到第 1 页，筛选条件保留
  const search = useListSearch<MatrixFilters>({ defaults: EMPTY_MATRIX_FILTERS, listKey: MATRIX_LIST_KEY, resetKey: [subjectKind, roleId, userId] });
  const { submittedParams, applySearch, page, pageSize, buildPagination } = search;

  const subject = useMemo<PermissionSubject | null>(() => {
    if (!subjectSummary) return null;
    return { permissions: new Set(subjectSummary.permissions), superAdmin: subjectSummary.superAdmin };
  }, [subjectSummary]);

  // 矩阵只针对后台登录令牌操作：公开 / 会员 / 设备 / 网关接口不经权限码门禁
  const rows = useMemo(() => listPermissionRows(catalogRows()), []);
  const verdicts = useMemo(() => {
    if (!subject) return null;
    const map = new Map<string, OperationVerdict>();
    for (const row of rows) map.set(row.key, judgeOperation(row, subject, { multiTenant: config.multiTenantMode }));
    return map;
  }, [rows, subject]);
  const verdictOf = useMemo(() => (verdicts ? (row: CatalogRow) => verdicts.get(row.key) ?? 'denied' : undefined), [verdicts]);

  const counts = useMemo(() => {
    const result: Record<OperationVerdict, number> = { allowed: 0, denied: 0, 'platform-only': 0 };
    if (verdicts) for (const verdict of verdicts.values()) result[verdict] += 1;
    return result;
  }, [verdicts]);

  const verdictFilter = verdictOf ? submittedParams.verdict : undefined;
  const filtered = rows.filter((row) =>
    matchesCatalogFilters(row, submittedParams) && (verdictFilter === undefined || verdictOf?.(row) === verdictFilter));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 选中主体即刻提交「只看可调用」；统计卡再点一次回到全部
  const selectSubject = (next: { roleId?: number | null; userId?: number | null }) => {
    if (next.roleId !== undefined) setRoleId(next.roleId);
    if (next.userId !== undefined) setUserId(next.userId);
    const picked = (next.roleId ?? next.userId) != null;
    applySearch({ ...submittedParams, verdict: picked ? 'allowed' : undefined });
  };
  const toggleVerdict = (verdict: OperationVerdict) => {
    applySearch({ ...submittedParams, verdict: submittedParams.verdict === verdict ? undefined : verdict });
  };
  const canPickUser = hasPermission('system:user:list');

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Typography.Text strong>查看主体</Typography.Text>
        <RadioGroup type="button" value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value as SubjectKind); applySearch({ ...submittedParams, verdict: undefined }); }}>
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
            onChange={(v) => selectSubject({ roleId: typeof v === 'number' ? v : null })}
            optionList={roles.map((r) => ({ value: r.id, label: `${r.name}（${r.code}）` }))}
            style={{ width: 240 }}
          />
        ) : (
          <UserSelect
            placeholder="选择用户"
            showClear
            disabled={!canPickUser}
            value={userId ?? undefined}
            onChange={(v) => selectSubject({ userId: typeof v === 'number' ? v : null })}
            style={{ width: 240 }}
          />
        )}
        {subjectSummary && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {subjectSummary.superAdmin
              ? <Tag size="small" color="violet">平台超管 · 全部放行</Tag>
              : <Typography.Text type="tertiary">持有 {subjectSummary.permissions.length} 个权限码</Typography.Text>}
            {user?.roles.map((r) => <Tag key={r.id} size="small">{r.name}</Tag>)}
          </span>
        )}
      </div>
      {subjectKind === 'user' && !canPickUser && (
        <Banner type="info" closeIcon={null} description="按用户查看需要「用户管理 → 查询」权限以检索用户。" style={{ marginBottom: 12 }} />
      )}

      {verdictOf && (
        <StatGrid minItemWidth={150} gap={12} style={{ marginBottom: 12 }}>
          <StatCard title="可调用" value={counts.allowed} icon={<CircleCheck size={16} />} accent="var(--semi-color-success)" onClick={() => toggleVerdict('allowed')} active={verdictFilter === 'allowed'} />
          <StatCard title="无权限" value={counts.denied} icon={<CircleSlash size={16} />} accent="var(--semi-color-danger)" onClick={() => toggleVerdict('denied')} active={verdictFilter === 'denied'} />
          <StatCard title="仅平台超管" value={counts['platform-only']} icon={<ShieldCheck size={16} />} accent="rgb(var(--semi-violet-5))" onClick={() => toggleVerdict('platform-only')} active={verdictFilter === 'platform-only'} />
        </StatGrid>
      )}

      <ApiCatalogSearchBar
        rows={rows}
        search={search}
        extraFilters={verdictOf ? <FilterSelect placeholder="全部判定" items={VERDICT_OPTIONS} {...search.bind('verdict')} width={120} /> : undefined}
        extra={(
          <Typography.Text type="tertiary" size="small">
            {subject
              ? `${verdictFilter ? VERDICT_LABELS[verdictFilter] : '全部'} ${filtered.length} / ${rows.length} 个后台接口`
              : '选择角色或用户后，默认只列出它可调用的接口'}
          </Typography.Text>
        )}
      />

      <ApiCatalogTable rows={pageRows} pagination={buildPagination(filtered.length)} onOpen={setSelected} verdictOf={verdictOf} />
      <ApiOperationSheet row={selected} onClose={() => setSelected(null)} onOpen={setSelected} />
    </>
  );
}
