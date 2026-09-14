/**
 * 接口目录页的纯数据层：目录条目、筛选状态与谓词、下拉选项、展示映射。
 * 目录本身由 `@zenith/shared/permission-catalog` 从契约派生，这里不复制任何契约知识。
 */
import type { TagColor } from '@douyinfe/semi-ui/lib/es/tag/interface';
import { CONTRACT_DOMAIN_LABELS, type ContractDomain } from '@zenith/shared/contracts';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import type { SecurityScheme } from '@zenith/shared/core';
import {
  listApiCatalog,
  listPermissionCatalog,
  operationsByPermission,
  SECURITY_SCHEME_LABELS,
  type AccessKind,
  type ApiCatalogEntry,
  type OperationVerdict,
  type PermissionCatalogEntry,
} from '@zenith/shared/permission-catalog';
import { textMatches } from '@/utils/pinyin';

export type HttpMethod = ApiCatalogEntry['method'];

/** 目录条目 + 稳定行键（同一路径不同方法各占一行） */
export interface CatalogRow extends ApiCatalogEntry {
  readonly key: string;
}

/** 目录一次构建、模块级缓存：契约是静态代码，无需随渲染重算 */
let cachedRows: CatalogRow[] | null = null;
export function catalogRows(): CatalogRow[] {
  cachedRows ??= listApiCatalog().map((entry) => ({ ...entry, key: `${entry.method} ${entry.fullPath}` }));
  return cachedRows;
}

/** 权限码 → 引用它的接口（详情抽屉「同权限码的接口」） */
let cachedByPermission: Map<string, CatalogRow[]> | null = null;
export function rowsByPermission(): Map<string, CatalogRow[]> {
  cachedByPermission ??= operationsByPermission(listPermissionRows(catalogRows())) as Map<string, CatalogRow[]>;
  return cachedByPermission;
}

/** 权限矩阵范围：只有后台登录令牌操作经权限码门禁 */
export type PermissionRow = CatalogRow & PermissionCatalogEntry;
export function listPermissionRows(rows: readonly CatalogRow[]): PermissionRow[] {
  return listPermissionCatalog(rows) as PermissionRow[];
}

// ─── 展示映射 ────────────────────────────────────────────────────────────────

export const METHOD_TAG_COLORS: Record<HttpMethod, TagColor> = {
  get: 'green',
  post: 'blue',
  put: 'orange',
  patch: 'amber',
  delete: 'red',
};

export const ACCESS_KIND_LABELS: Record<AccessKind, string> = {
  permission: '权限码',
  authenticated: '登录即可',
  platform: '仅平台超管',
};

export const VERDICT_LABELS: Record<OperationVerdict, string> = {
  allowed: '可调用',
  denied: '无权限',
  'platform-only': '仅平台超管',
};

export const VERDICT_TAG_COLORS: Record<OperationVerdict, TagColor> = {
  allowed: 'green',
  denied: 'red',
  'platform-only': 'violet',
};

export function domainLabel(domain: ContractDomain): string {
  return CONTRACT_DOMAIN_LABELS[domain] ?? domain;
}

/** 权限码的中文标签（注册表登记的按钮名） */
export function permissionLabel(code: string): string | undefined {
  return ALL_PERMISSIONS[code]?.label;
}

/** 访问要求的一句话描述：权限码列表 / 登录即可 / 仅平台超管（含多租户限定） */
export function describeAccess(entry: ApiCatalogEntry): string {
  if (entry.security !== 'bearer' || entry.accessKind === null) return SECURITY_SCHEME_LABELS[entry.security];
  const platform = entry.platformOnly === true ? '仅平台超管' : entry.platformOnly === 'multi-tenant' ? '多租户下仅平台超管' : null;
  if (entry.accessKind === 'authenticated') return ACCESS_KIND_LABELS.authenticated;
  if (entry.accessKind === 'platform') return platform ?? ACCESS_KIND_LABELS.platform;
  const codes = entry.permissions.join(' / ');
  return platform ? `${codes}（${platform}）` : codes;
}

// ─── 筛选 ────────────────────────────────────────────────────────────────────

export interface CatalogFilters {
  keyword: string;
  domain: ContractDomain | undefined;
  method: HttpMethod | undefined;
  security: SecurityScheme | undefined;
  accessKind: AccessKind | undefined;
  permission: string | undefined;
  audit: 'yes' | 'no' | undefined;
  feature: string | undefined;
  /** 「其他凭证」统计卡：只看会员令牌 / 设备签名 / 开放网关 */
  otherCredential: true | undefined;
}

export const EMPTY_FILTERS: CatalogFilters = {
  keyword: '',
  domain: undefined,
  method: undefined,
  security: undefined,
  accessKind: undefined,
  permission: undefined,
  audit: undefined,
  feature: undefined,
  otherCredential: undefined,
};

/** 权限矩阵的筛选：目录筛选 + 判定结果 */
export interface MatrixFilters extends CatalogFilters {
  verdict: OperationVerdict | undefined;
}

export const EMPTY_MATRIX_FILTERS: MatrixFilters = { ...EMPTY_FILTERS, verdict: undefined };

export function hasActiveFilter(filters: CatalogFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined && value !== '');
}

/** 关键字命中：名称 / 路径 / 操作名 / 权限码 / 审计文案，名称支持拼音（与菜单搜索同口径） */
function matchesKeyword(row: CatalogRow, keyword: string): boolean {
  if (!keyword) return true;
  const lower = keyword.toLowerCase();
  return textMatches(row.summary, keyword)
    || row.fullPath.toLowerCase().includes(lower)
    || row.name.toLowerCase().includes(lower)
    || row.permissions.some((code) => code.includes(lower))
    || (row.audit !== null && textMatches(row.audit, keyword));
}

export function matchesCatalogFilters(row: CatalogRow, filters: CatalogFilters): boolean {
  if (filters.otherCredential && (row.security === 'bearer' || row.security === 'none')) return false;
  if (filters.domain !== undefined && row.domain !== filters.domain) return false;
  if (filters.method !== undefined && row.method !== filters.method) return false;
  if (filters.security !== undefined && row.security !== filters.security) return false;
  if (filters.accessKind !== undefined && row.accessKind !== filters.accessKind) return false;
  if (filters.permission !== undefined && !row.permissions.includes(filters.permission as never)) return false;
  if (filters.audit === 'yes' && row.audit === null) return false;
  if (filters.audit === 'no' && row.audit !== null) return false;
  if (filters.feature !== undefined && row.feature !== filters.feature) return false;
  return matchesKeyword(row, filters.keyword.trim());
}

// ─── 下拉选项（由目录派生，只出现实际存在的值） ───────────────────────────────

export const METHOD_OPTIONS = (['get', 'post', 'put', 'patch', 'delete'] as const satisfies readonly HttpMethod[])
  .map((value) => ({ value, label: value.toUpperCase() }));

export const SECURITY_OPTIONS = (Object.keys(SECURITY_SCHEME_LABELS) as SecurityScheme[])
  .map((value) => ({ value, label: SECURITY_SCHEME_LABELS[value] }));

export const ACCESS_KIND_OPTIONS = (Object.keys(ACCESS_KIND_LABELS) as AccessKind[])
  .map((value) => ({ value, label: ACCESS_KIND_LABELS[value] }));

export const AUDIT_OPTIONS = [
  { value: 'yes' as const, label: '记录审计' },
  { value: 'no' as const, label: '不记审计' },
];

export function domainOptions(rows: readonly CatalogRow[]) {
  const present = new Set(rows.map((row) => row.domain));
  return (Object.keys(CONTRACT_DOMAIN_LABELS) as ContractDomain[])
    .filter((domain) => present.has(domain))
    .map((domain) => ({ value: domain, label: CONTRACT_DOMAIN_LABELS[domain] }));
}

export function permissionOptions(rows: readonly CatalogRow[]) {
  const codes = new Set<string>();
  for (const row of rows) for (const code of row.permissions) codes.add(code);
  return [...codes].sort().map((code) => {
    const label = permissionLabel(code);
    return { value: code, label: label ? `${code}（${label}）` : code };
  });
}

export function featureOptions(rows: readonly CatalogRow[]) {
  const features = new Set<string>();
  for (const row of rows) if (row.feature) features.add(row.feature);
  return [...features].sort().map((value) => ({ value, label: value }));
}

// ─── 统计 ────────────────────────────────────────────────────────────────────

export interface CatalogStats {
  total: number;
  permission: number;
  authenticated: number;
  platform: number;
  public: number;
  /** 会员令牌 / 设备签名 / 开放网关 */
  otherCredential: number;
}

export function summarizeCatalog(rows: readonly CatalogRow[]): CatalogStats {
  const stats: CatalogStats = { total: rows.length, permission: 0, authenticated: 0, platform: 0, public: 0, otherCredential: 0 };
  for (const row of rows) {
    if (row.security === 'none') stats.public += 1;
    else if (row.security !== 'bearer') stats.otherCredential += 1;
    else if (row.accessKind === 'permission') stats.permission += 1;
    else if (row.accessKind === 'authenticated') stats.authenticated += 1;
    else if (row.accessKind === 'platform') stats.platform += 1;
  }
  return stats;
}
