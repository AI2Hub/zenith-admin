/**
 * 接口目录 / 权限矩阵的纯判定逻辑与展示常量——**不引入任何契约聚合**。
 *
 * 前端只从这里取 judgeOperation / 标签映射；目录数据由服务端 `GET /api/api-catalog` 提供（服务端持有同一份契约代码）。
 * 若前端直接 import `./contracts` 聚合，会把全部域的契约模块拉进共享分包（首屏 +70KB、+100 余个 chunk）。
 */
import type { OperationAccess, SecurityScheme } from './core/contract';

/** 访问要求的形态，供目录筛选 / 展示 */
export type AccessKind = 'permission' | 'authenticated' | 'platform';

export const ACCESS_KINDS = ['permission', 'authenticated', 'platform'] as const satisfies readonly AccessKind[];

/** 全部凭证类型（与 SecurityScheme 一一对应，供 zod 枚举与筛选选项） */
export const SECURITY_SCHEMES = ['bearer', 'none', 'member-bearer', 'device-signature', 'open-gateway'] as const satisfies readonly SecurityScheme[];

/** 认证方式展示名 */
export const SECURITY_SCHEME_LABELS: Record<SecurityScheme, string> = {
  bearer: '登录令牌',
  none: '公开',
  'member-bearer': '会员令牌',
  'device-signature': '设备签名',
  'open-gateway': '开放网关',
};

export function accessKindOf(access: OperationAccess): AccessKind {
  if (access === 'authenticated') return 'authenticated';
  return access.permission === undefined ? 'platform' : 'permission';
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

export const OPERATION_VERDICTS = ['allowed', 'denied', 'platform-only'] as const satisfies readonly OperationVerdict[];

/** 判定所需的最小输入（目录条目的子集） */
export interface JudgeableOperation {
  readonly access: OperationAccess;
  readonly permissions: readonly string[];
  readonly platformOnly: false | true | 'multi-tenant';
}

/**
 * 判定一个主体能否调用某操作。`multiTenant` 为部署模式：`platformOnly: 'multi-tenant'` 只在多租户模式下限定平台超管，
 * 单租户部署由权限码决定。与服务端门禁链（authMiddleware → platformAdminOnly → guard）同口径。
 */
export function judgeOperation(
  entry: JudgeableOperation,
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
