/**
 * 接口权限目录：由契约 `access` 派生的只读视图，前后端共用同一份推导——
 * 前端权限矩阵页直接在浏览器内计算目录与命中结果，服务端只补充「角色 / 用户各自持有哪些权限码」。
 *
 * 没有任何新表：接口需要什么权限 = 契约声明；谁拥有什么权限 = 角色 / 用户 / 用户组绑定的按钮菜单。
 */
import { accessPermissions, accessPlatformOnly, type AnyOperation, type OperationAccess } from './core/contract';
import type { Permission } from './core/permissions';
import { CONTRACTS_BY_DOMAIN, listAllOperations, type ContractDomain } from './contracts';

/** 访问要求的形态，供目录筛选 / 展示 */
export type AccessKind = 'permission' | 'authenticated' | 'platform';

export interface PermissionCatalogEntry {
  readonly domain: ContractDomain;
  readonly basePath: string;
  readonly name: string;
  readonly method: AnyOperation['method'];
  readonly fullPath: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly deprecated: boolean;
  readonly access: OperationAccess;
  readonly accessKind: AccessKind;
  /** 任一即可的权限码；`authenticated` / 仅平台超管 → 空 */
  readonly permissions: readonly Permission[];
  readonly platformOnly: false | true | 'multi-tenant';
  readonly audit: string | null;
  readonly feature: string | null;
}

export function accessKindOf(access: OperationAccess): AccessKind {
  if (access === 'authenticated') return 'authenticated';
  return access.permission === undefined ? 'platform' : 'permission';
}

/** 全部后台登录令牌操作（公开 / 会员 / 设备 / 开放网关操作不在权限矩阵范围内），按域 → 契约组 → 声明顺序 */
export function listPermissionCatalog(): PermissionCatalogEntry[] {
  const entries: PermissionCatalogEntry[] = [];
  for (const { domain, contract, op } of listAllOperations()) {
    if (op.security !== 'bearer' || op.access === undefined) continue;
    entries.push({
      domain,
      basePath: contract.basePath,
      name: op.name,
      method: op.method,
      fullPath: op.fullPath,
      summary: op.summary,
      tags: op.tags,
      deprecated: op.deprecated,
      access: op.access,
      accessKind: accessKindOf(op.access),
      permissions: accessPermissions(op.access),
      platformOnly: accessPlatformOnly(op.access),
      audit: op.audit?.description ?? null,
      feature: op.feature ?? null,
    });
  }
  return entries;
}

/** 权限矩阵里的「主体」：一个角色或一个用户生效的权限集合 */
export interface PermissionSubject {
  /** 权限码集合；平台超管为 `['*']` 语义时以 `superAdmin` 标记 */
  readonly permissions: ReadonlySet<string> | readonly string[];
  /** 平台超管（super_admin 且归属平台）：全部操作放行，含仅平台限定的操作 */
  readonly superAdmin: boolean;
}

export type OperationVerdict =
  /** 放行 */
  | 'allowed'
  /** 缺少全部权限码 */
  | 'denied'
  /** 仅平台超管可执行（多租户部署下的 `'multi-tenant'` 限定，或始终限定的 `true`） */
  | 'platform-only';

/**
 * 判定一个主体能否调用某操作。`multiTenant` 为部署模式：`platformOnly: 'multi-tenant'` 只在多租户模式下限定平台超管，
 * 单租户部署由权限码决定。与服务端门禁链（authMiddleware → platformAdminOnly → guard）同口径。
 */
export function judgeOperation(
  entry: Pick<PermissionCatalogEntry, 'access' | 'permissions' | 'platformOnly'>,
  subject: PermissionSubject,
  options: { readonly multiTenant: boolean },
): OperationVerdict {
  if (subject.superAdmin) return 'allowed';
  const platformLimited = entry.platformOnly === true || (entry.platformOnly === 'multi-tenant' && options.multiTenant);
  if (platformLimited) return 'platform-only';
  if (entry.access === 'authenticated' || entry.permissions.length === 0) return 'allowed';
  const owned = subject.permissions instanceof Set ? subject.permissions : new Set(subject.permissions);
  if (owned.has('*')) return 'allowed';
  return entry.permissions.some((code) => owned.has(code)) ? 'allowed' : 'denied';
}

/** 权限码 → 引用它的操作（同一码可被多个接口引用；`uiOnly` 的码不会出现在这里） */
export function operationsByPermission(catalog: readonly PermissionCatalogEntry[] = listPermissionCatalog()): Map<Permission, PermissionCatalogEntry[]> {
  const map = new Map<Permission, PermissionCatalogEntry[]>();
  for (const entry of catalog) {
    for (const code of entry.permissions) {
      const list = map.get(code) ?? [];
      list.push(entry);
      map.set(code, list);
    }
  }
  return map;
}

export const PERMISSION_CATALOG_DOMAINS = Object.keys(CONTRACTS_BY_DOMAIN) as ContractDomain[];
