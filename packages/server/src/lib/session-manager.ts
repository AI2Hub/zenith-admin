import crypto from 'node:crypto';
import type { SessionClientKind, SessionRevokeReason } from '@zenith/shared/identity';
import { config } from '../config';
import redis from './redis';
import { createRedisSessionStore } from './redis-session-store';

export interface SessionInfo {
  tokenId: string;
  userId: number;
  username: string;
  nickname: string;
  tenantId?: number | null;
  /** 登录终端（网页 / 移动审批 / 桌面端），并发限制按终端分别计算时的分组键 */
  client: SessionClientKind;
  ip: string;
  location: string | null;
  browser: string;
  os: string;
  loginAt: Date;
  lastActiveAt: Date;
  /** 模拟会话的实际操作人；本人登录为空 */
  impersonatorId?: number | null;
  impersonatorName?: string | null;
}

const { keyPrefix } = config.redis;
const SESSION_PREFIX = `${keyPrefix}session:`;
const BLACKLIST_PREFIX = `${keyPrefix}blacklist:`;
const REFRESH_PREFIX = `${keyPrefix}refresh:`;
const USER_SESSIONS_PREFIX = `${keyPrefix}user-sessions:`;

/**
 * 管理员会话存储：会话 TTL 8h（每次请求续期），黑名单 TTL 2h（与 accessToken 一致），
 * refresh 授权 TTL 30d（与 refreshToken 一致）。底层通用实现见 redis-session-store.ts。
 */
const store = createRedisSessionStore<SessionInfo>({
  sessionPrefix: SESSION_PREFIX,
  blacklistPrefix: BLACKLIST_PREFIX,
  refreshPrefix: REFRESH_PREFIX,
  ownerIndexPrefix: USER_SESSIONS_PREFIX,
  ownerIdOf: (s) => s.userId,
});

/** Generate a unique token ID */
export function generateTokenId(): string {
  return crypto.randomUUID();
}

/** Register a new session on login */
export async function registerSession(info: Omit<SessionInfo, 'lastActiveAt'>): Promise<void> {
  await store.register(info);
}

/** 为 jti 签发 refresh 授权：只有登录 / 续签轮换产生的 jti 才能用来换发 token */
export async function grantRefresh(tokenId: string): Promise<void> {
  await store.grantRefresh(tokenId);
}

/** 一次性消费 refresh 授权；返回 false 表示该 refresh token 已登出 / 已被轮换 / 已过期 */
export async function consumeRefreshGrant(tokenId: string): Promise<boolean> {
  return store.consumeRefreshGrant(tokenId);
}

/** Refresh session activity timestamp and reset TTL. Returns true if session existed, false if not found. */
export async function touchSession(tokenId: string): Promise<boolean> {
  return store.touch(tokenId);
}

/** Check if a token is blacklisted */
export async function isTokenBlacklisted(tokenId: string): Promise<boolean> {
  return store.isBlacklisted(tokenId);
}

/** 令牌的吊销原因（被挤下线 / 改密 / 管理员强退 / 登出 / 轮换）；未吊销返回 null */
export async function getTokenRevocation(tokenId: string): Promise<SessionRevokeReason | null> {
  return store.getRevocation(tokenId);
}

/** Force logout a session by tokenId */
export async function forceLogout(tokenId: string, reason: SessionRevokeReason = 'force-logout'): Promise<boolean> {
  return store.forceLogout(tokenId, reason);
}

/** Force logout all sessions belonging to a specific user */
export async function forceLogoutAllByUser(userId: number, reason: SessionRevokeReason = 'force-logout'): Promise<string[]> {
  return store.forceLogoutByOwner(userId, { reason });
}

/** 强制下线某用户除指定 jti 外的全部会话（改密后保留当前设备） */
export async function forceLogoutAllByUserExcept(
  userId: number,
  keepTokenId: string | undefined,
  reason: SessionRevokeReason = 'password-changed',
): Promise<string[]> {
  return store.forceLogoutByOwner(userId, { except: keepTokenId, reason });
}

/** Force logout all sessions belonging to any of the specified users (single SCAN + pipeline) */
export async function forceLogoutAllByUsers(userIds: number[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const idSet = new Set(userIds);
  return store.forceLogoutMatching((s) => idSet.has(s.userId));
}

/** 批量吊销已知会话（登录期并发限制挤人用），返回被下线的 tokenId 列表 */
export async function revokeSessions(sessions: SessionInfo[], reason: SessionRevokeReason): Promise<string[]> {
  return store.revokeSessions(sessions, reason);
}

/** 登出 / 轮换淘汰：吊销 access token、撤销 refresh 授权并删除在线会话 */
export async function removeSession(tokenId: string, reason: Extract<SessionRevokeReason, 'logout' | 'rotated'> = 'logout'): Promise<void> {
  await store.remove(tokenId, reason);
}

/** Get a single session by tokenId */
export async function getSession(tokenId: string): Promise<SessionInfo | null> {
  return store.get(tokenId);
}

/** 某用户的全部在线会话（含模拟会话；按主体索引取，不做全量 SCAN） */
export async function listUserSessions(userId: number): Promise<SessionInfo[]> {
  return store.listByOwner(userId);
}

/** Get all online sessions */
export async function getOnlineSessions(): Promise<SessionInfo[]> {
  return store.getAll();
}

/** Get online session count */
export async function getOnlineCount(): Promise<number> {
  return store.count();
}

// ─── 登录失败锁定 ────────────────────────────────────────────────────────────

const LOGIN_ATTEMPT_PREFIX = `${keyPrefix}login_attempt:`;
const LOGIN_LOCK_PREFIX = `${keyPrefix}login_lock:`;

/** 检查账号是否被锁定，返回剩余秒数（0 表示未锁定） */
export async function checkLoginLock(username: string): Promise<number> {
  const ttl = await redis.ttl(`${LOGIN_LOCK_PREFIX}${username}`);
  return Math.max(ttl, 0);
}

/** 记录一次登录失败，达到阈值后自动锁定，返回剩余允许次数 */
export async function recordLoginFailure(
  username: string,
  maxAttempts: number,
  lockDurationSeconds: number,
): Promise<number> {
  const attemptKey = `${LOGIN_ATTEMPT_PREFIX}${username}`;
  const count = await redis.incr(attemptKey);
  // 第一次失败时设置过期时间（锁定时长，避免永久累积）
  if (count === 1) {
    await redis.expire(attemptKey, lockDurationSeconds);
  }
  const remaining = maxAttempts - count;
  if (remaining <= 0) {
    // 触发锁定
    await redis.set(`${LOGIN_LOCK_PREFIX}${username}`, '1', 'EX', lockDurationSeconds);
    await redis.del(attemptKey);
  }
  return Math.max(remaining, 0);
}

/** 登录成功后清除失败计数 */
export async function clearLoginAttempts(username: string): Promise<void> {
  await redis.del(`${LOGIN_ATTEMPT_PREFIX}${username}`);
}

/** 批量检查多个账号的锁定剩余秒数（0 表示未锁定），使用 pipeline 减少 RTT */
export async function batchCheckLoginLock(usernames: string[]): Promise<Map<string, number>> {
  if (usernames.length === 0) return new Map();
  const pipeline = redis.pipeline();
  for (const username of usernames) {
    pipeline.ttl(`${LOGIN_LOCK_PREFIX}${username}`);
  }
  const results = await pipeline.exec();
  const map = new Map<string, number>();
  usernames.forEach((username, i) => {
    const [err, ttl] = results?.[i] ?? [null, -2];
    map.set(username, err ? 0 : Math.max(Number(ttl), 0));
  });
  return map;
}

/** 管理员手动解除账号锁定 */
export async function unlockUser(username: string): Promise<void> {
  await Promise.all([
    redis.del(`${LOGIN_LOCK_PREFIX}${username}`),
    redis.del(`${LOGIN_ATTEMPT_PREFIX}${username}`),
  ]);
}
