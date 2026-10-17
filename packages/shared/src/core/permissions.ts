/**
 * 各域 `permissions.ts` 经 `definePermissions()` 声明权限，聚合于 `@zenith/shared/permissions`。
 * 此处仅导入聚合表类型，推导完整的 `Permission` 联合，不引入 core → 业务域的运行时依赖。
 * 注册表生成种子 button，并以 `Permission` 约束契约 access 及前后端权限检查。
 */
import type { PERMISSION_REGISTRY_BY_DOMAIN } from '../permissions';

export interface PermissionMeta {
  /** 按钮标题（角色管理菜单树 / 权限矩阵展示） */
  readonly label: string;
  /**
   * 所属页面菜单的 `name`（`SEED_MENUS` 中 type 为 menu / directory 的行）；同一权限挂多个页面时传数组。
   * 无页面的纯 API 权限挂到虚拟隐藏目录 `ApiOnlyPermissions`。
   */
  readonly menu: string | readonly string[];
  /** 覆盖生成的 button id（缺省 = 页面 id + 1 + 在该页面的序号）；与 `menu` 数组一一对应 */
  readonly id?: number | readonly (number | undefined)[];
  /** 覆盖生成的排序值（缺省 = 在该页面的序号）；与 `menu` 数组一一对应 */
  readonly sort?: number | readonly (number | undefined)[];
  /** 服务端没有任何接口检查该码：纯前端门控，或待清理的死权限 */
  readonly uiOnly?: boolean;
  /** 权限治理默认风险等级；未声明时按 low 处理 */
  readonly riskLevel?: 'low' | 'high' | 'critical';
  /** 权限治理默认审批策略；未声明时按 none 处理 */
  readonly approvalPolicy?: 'none' | 'manager' | 'manager_security' | 'two_person';
  /** 临时授权默认最大时长（分钟）；未声明时由运行时策略决定 */
  readonly maxDurationMinutes?: number;
  /** 定期复核间隔（天）；0 表示不自动纳入复核 */
  readonly reviewIntervalDays?: number;
}

type DomainRegistry = (typeof PERMISSION_REGISTRY_BY_DOMAIN)[keyof typeof PERMISSION_REGISTRY_BY_DOMAIN];
type KeysOfUnion<T> = T extends unknown ? keyof T & string : never;

/** 全部已注册权限码的字面量联合（各域注册表键的并集） */
export type Permission = KeysOfUnion<DomainRegistry>;

type PrefixOfSuffix<T, S extends string> = T extends `${infer P}:${S}` ? P : never;

/** 拥有 `:list` 后缀的权限前缀（`mountCrud` 按前缀 + 约定后缀派生 `:list / :create / :update / :delete`） */
export type PermissionPrefix = PrefixOfSuffix<Permission, 'list'>;

/** 同时拥有 `:update` 与 `:delete` 的权限前缀（列表操作列按前缀派生编辑 / 删除门控） */
export type CrudPermissionPrefix = Extract<PrefixOfSuffix<Permission, 'update'>, PrefixOfSuffix<Permission, 'delete'>>;

/** 声明一个域的权限码注册表；`const` 泛型保留键的字面量类型 */
export function definePermissions<const T extends Record<string, PermissionMeta>>(defs: T): T {
  return defs;
}

/** 权限值归一为数组（`guard` / 前端门控接受单个或多个「任一即可」） */
export function permissionList(permission: Permission | readonly Permission[]): readonly Permission[] {
  return typeof permission === 'string' ? [permission] : permission;
}
