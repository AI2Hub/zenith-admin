import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DbExecutor } from '../db/types';
import { SUPER_ADMIN_CODE } from '@zenith/shared/identity';
import { db } from '../db';
import { users, identityAccessGrants, identityAccessGrantItems } from '../db/schema';
import { onInvalidate, onInvalidationReset } from './invalidation-bus';
import { sendToUser } from './ws-manager';
import { availablePermissionCodes, navigationForPermissions } from '../services/identity/permission-catalog.service';
import { enabledGroupRolesWith, extractEnabledGroupRoles } from './user-group-access';
import { config } from '../config';
import redis from './redis';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_SECONDS = 300;
/** Redis key：{prefix}perm:{userId}，与 session/blacklist 同一命名空间 */
const PERM_CACHE_PREFIX = `${config.redis.keyPrefix}perm:`;

interface CacheEntry {
  permissions: string[];
  menuIds: number[];
  timestamp: number;
  /** 下一个临时授权时间边界；到达后不能继续使用旧缓存 */
  nextPermissionBoundaryAt: number | null;
}

// 进程内缓存：仅作为 Redis 不可用时的降级数据源（单实例语义）。
// 主存储为 Redis，保证多实例部署下 clearUserPermissionCache 撤权即时生效。
const localCache = new Map<number, CacheEntry>();
const freshPermissionStore = new AsyncLocalStorage<{ userId: number; permissions: string[] }>();

/** Background delivery guards must not reuse a permissions snapshot taken before revocation. */
export async function runWithFreshUserPermissions<T>(userId: number, work: () => Promise<T>, executor: DbExecutor = db): Promise<T> {
  const { permissions } = await fetchUserPermissionData(userId, executor, true);
  return freshPermissionStore.run({ userId, permissions }, work);
}

function isCacheEntryValid(entry: CacheEntry | null | undefined): entry is CacheEntry {
  if (!entry || Date.now() - entry.timestamp >= CACHE_TTL) return false;
  return entry.nextPermissionBoundaryAt === null || Date.now() < entry.nextPermissionBoundaryAt;
}

async function readCacheEntry(userId: number): Promise<CacheEntry | null> {
  try {
    const raw = await redis.get(`${PERM_CACHE_PREFIX}${userId}`);
    const entry = raw ? (JSON.parse(raw) as CacheEntry) : null;
    return isCacheEntryValid(entry) ? entry : null;
  } catch {
    const entry = localCache.get(userId);
    return isCacheEntryValid(entry) ? entry : null;
  }
}

async function writeCacheEntry(userId: number, entry: CacheEntry): Promise<void> {
  localCache.set(userId, entry);
  try {
    await redis.set(`${PERM_CACHE_PREFIX}${userId}`, JSON.stringify(entry), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // Redis 不可用时退化为进程内缓存
  }
}

async function clearRedisPermCache(userId?: number): Promise<void> {
  if (userId !== undefined) {
    await redis.del(`${PERM_CACHE_PREFIX}${userId}`);
    return;
  }
  // 全量清除：SCAN 按前缀逐批删除，避免 KEYS 阻塞
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${PERM_CACHE_PREFIX}*`, 'COUNT', 200);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}

/**
 * 平台超管判定：角色 code 含 super_admin **且** 归属平台（tenantId 为 null）。
 * 仅凭 code 判定会被租户自建同名角色伪造（横向/纵向提权），必须双条件校验。
 */
export function isSuperAdmin(user: { roles: string[]; tenantId?: number | null }): boolean {
  return user.roles.includes(SUPER_ADMIN_CODE) && (user.tenantId ?? null) === null;
}

export async function getUserPermissions(userId: number): Promise<string[]> {
  const fresh = freshPermissionStore.getStore();
  if (fresh?.userId === userId) return fresh.permissions;
  const entry = await readCacheEntry(userId);
  if (entry) return entry.permissions;

  const { permissions, menuIds, nextPermissionBoundaryAt } = await fetchUserPermissionData(userId);
  await writeCacheEntry(userId, { permissions, menuIds, timestamp: Date.now(), nextPermissionBoundaryAt });
  return permissions;
}

export async function getUserMenuIds(userId: number): Promise<number[]> {
  const entry = await readCacheEntry(userId);
  if (entry) return entry.menuIds;

  const { permissions, menuIds, nextPermissionBoundaryAt } = await fetchUserPermissionData(userId);
  await writeCacheEntry(userId, { permissions, menuIds, timestamp: Date.now(), nextPermissionBoundaryAt });
  return menuIds;
}

export async function getUserPermissionBoundary(userId: number): Promise<number | null> {
  const cached = await readCacheEntry(userId);
  if (cached) return cached.nextPermissionBoundaryAt;
  const data = await fetchUserPermissionData(userId);
  await writeCacheEntry(userId, { ...data, timestamp: Date.now() });
  return data.nextPermissionBoundaryAt;
}

async function fetchUserPermissionData(userId: number, executor: DbExecutor = db, _fresh = false): Promise<{ permissions: string[]; menuIds: number[]; nextPermissionBoundaryAt: number | null }> {
  const now = new Date();
  const user = await executor.query.users.findFirst({
    where: eq(users.id, userId), columns: { tenantId: true, status: true },
    with: {
      userRoles: { with: { role: { columns: { permissionCodes: true, status: true } } } },
      directPermissions: { columns: { permissionCode: true } },
      userMenus: { with: { menu: { columns: { id: true, permission: true, status: true } } } },
      userGroupMembers: enabledGroupRolesWith({ columns: { permissionCodes: true, status: true } }),
      accessGrants: {
        where: inArray(identityAccessGrants.status, ['scheduled', 'active']),
        with: { items: { where: inArray(identityAccessGrantItems.status, ['scheduled', 'active']) } },
      },
    },
  });
  if (!user || user.status !== 'enabled') return { permissions: [], menuIds: [], nextPermissionBoundaryAt: null };
  const granted = user.accessGrants.flatMap(grant => grant.items);
  const active = granted.filter(item => item.startsAt <= now && (!item.expiresAt || item.expiresAt > now));
  const nextPermissionBoundaryAt = granted.flatMap(item => [item.startsAt, item.expiresAt]).filter((date): date is Date => date !== null && date > now)
    .reduce<number | null>((boundary, date) => boundary === null ? date.getTime() : Math.min(boundary, date.getTime()), null);
  const codes = [
    ...user.userRoles.filter(({ role }) => role.status === 'enabled').flatMap(({ role }) => role.permissionCodes),
    ...extractEnabledGroupRoles(user.userGroupMembers).roles.flatMap(role => role.permissionCodes),
    ...user.directPermissions.map(item => item.permissionCode), ...active.map(item => item.permissionCode),
  ];
  const permissions = await availablePermissionCodes(codes, user.tenantId, executor);
  const menuIds = await navigationForPermissions(permissions, executor);
  // Explicit navigation-only grants cannot introduce any operation permission.
  const navigation = user.userMenus.filter(({ menu }) => menu.status === 'enabled' && !menu.permission).map(({ menu }) => menu.id);
  return { permissions, menuIds: [...new Set([...menuIds, ...navigation])], nextPermissionBoundaryAt };
}

/**
 * 清除用户权限缓存（Redis 主存储 + 本地降级缓存）。
 * 等待 Redis 删除完成，确保调用方返回时撤权已生效。
 */
export async function notifyUserPermissionsChanged(userId: number): Promise<void> {
  await clearUserPermissionCache(userId);
  sendToUser(userId, { type: 'identity:permissions-changed', payload: { userId } });
}

function invalidateUserEntry(key?: string | null): void {
  const userId = Number(key);
  if (!Number.isSafeInteger(userId) || userId <= 0) localCache.clear();
  else {
    localCache.delete(userId);
    void clearRedisPermCache(userId).catch(() => {});
  }
}

onInvalidate('identity_access_grants', message => invalidateUserEntry(message.key));
onInvalidate('identity_access_grant_items', message => {
  localCache.clear();
  const grantId = Number(message.key);
  if (Number.isSafeInteger(grantId) && grantId > 0) void db.query.identityAccessGrants.findFirst({ where: eq(identityAccessGrants.id, grantId), columns: { userId: true } })
    .then(grant => { if (grant) invalidateUserEntry(String(grant.userId)); }).catch(() => {});
});
onInvalidate('user_roles', message => invalidateUserEntry(message.key));
onInvalidate('identity_user_permissions', message => invalidateUserEntry(message.key));
onInvalidate('roles', () => invalidateUserEntry());
onInvalidate('user_group_roles', () => invalidateUserEntry());
onInvalidate('user_menus', message => invalidateUserEntry(message.key));
onInvalidate('user_group_members', message => invalidateUserEntry(message.key));
onInvalidationReset(() => { localCache.clear(); void clearRedisPermCache().catch(() => {}); });

export async function clearUserPermissionCache(userId?: number): Promise<void> {
  if (userId === undefined) {
    localCache.clear();
  } else {
    localCache.delete(userId);
  }
  await clearRedisPermCache(userId).catch(() => {});
}
