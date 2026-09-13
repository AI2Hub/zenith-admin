/**
 * 权限码注册表的类型基座。
 *
 * 每个业务域在 `shared/src/{域}/permissions.ts` 用 `definePermissions()` 声明自己的权限码，
 * 并通过 `declare module` 把键合并进 `PermissionRegistry`，于是 `Permission` 在 core 里就是全部域权限码的字面量联合，
 * 而 core 不需要 import 任何业务域（无环）。运行时聚合见 `@zenith/shared/permissions`。
 *
 * 权限码是唯一真相：种子 button 节点由注册表生成，服务端 `guard({ permission })`、`mountCrud({ permission })`、
 * 前端 `hasPermission()` / `permission=` 属性都以 `Permission` 类型约束——拼错的码在编译期报错，而不是在生产静默放行 / 拒绝。
 */

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
}

/** 由各域 `declare module` 合并键；键即权限码 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 声明合并的锚点
export interface PermissionRegistry {}

/** 全部已注册权限码的字面量联合 */
export type Permission = keyof PermissionRegistry;

/** `definePermissions()` 结果 → 供 `interface PermissionRegistry extends` 合并的键集合 */
export type PermissionCodes<T> = { readonly [K in keyof T]: true };

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
