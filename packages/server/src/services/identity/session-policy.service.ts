/**
 * 登录会话并发限制（身份安全 → 会话并发）。
 *
 * 策略 `identitySecurity.session`（租户级）：`maxSessions` 同时在线上限（0 不限）、`scope` 全部终端合计 / 按终端分别计算、
 * `exceedAction` 超限时挤掉最早的会话 / 拒绝新登录。
 *
 * 执行点唯一：所有登录路径（密码 / MFA 完成 / SSO / OAuth）汇于 `finalizeLogin()`——先注册新会话，再按策略挤人，
 * 新登录永远保留（踢人失败也不影响本次登录，用户不会处于 0 个会话）。refresh 轮换、切换租户视角是会话迁移，不触发；
 * 模拟登录会话是操作者的会话（`impersonatorId` 非空），既不计数也不会被挤。
 *
 * 两台设备同秒登录：各自「保留自己、挤最早的」，后到者的强制把先到者挤掉，最终一致，无需分布式锁。
 */
import { SESSION_CLIENT_KIND_LABELS, type SessionClientKind } from '@zenith/shared/identity';
import type { SessionForceLogoutPayload } from '@zenith/shared/platform';
import type { SessionConcurrencyPolicy } from '@zenith/shared/settings';
import { formatDateTime } from '../../lib/datetime';
import { listUserSessions, revokeSessions, type SessionInfo } from '../../lib/session-manager';
import { getSettings } from '../../lib/settings';
import { closeTokenConnection, sendToToken } from '../../lib/ws-manager';

/** 触发并发判定的新登录 */
export interface NewLoginContext {
  userId: number;
  tenantId: number | null;
  /** 新登录的 jti（已注册到会话存储） */
  tokenId: string;
  client: SessionClientKind;
  ip: string;
  location: string | null;
  browser: string;
  os: string;
  loginAt: Date;
}

export async function loadSessionPolicy(tenantId: number | null): Promise<SessionConcurrencyPolicy> {
  return (await getSettings('identitySecurity', { tenantId })).session;
}

/** 参与并发统计的既有会话：排除模拟会话与新登录自身；按终端分别计算时只看同类终端 */
function countedSessions(sessions: SessionInfo[], policy: SessionConcurrencyPolicy, client: SessionClientKind, exceptTokenId?: string): SessionInfo[] {
  return sessions.filter((s) =>
    s.tokenId !== exceptTokenId
    && !s.impersonatorId
    && (policy.scope === 'global' || s.client === client),
  );
}

/**
 * 拒绝模式的前置判定（凭据校验之后、签发 token 之前调用，避免未认证请求探测账号是否在线）：
 * 返回会占用名额的既有会话；未启用限制、非拒绝模式或未超限时返回空数组。
 */
export async function findConflictingSessions(
  login: { userId: number; tenantId: number | null; client: SessionClientKind },
  policy?: SessionConcurrencyPolicy,
): Promise<SessionInfo[]> {
  const effective = policy ?? await loadSessionPolicy(login.tenantId);
  if (effective.maxSessions === 0 || effective.exceedAction !== 'reject-new') return [];
  const existing = countedSessions(await listUserSessions(login.userId), effective, login.client);
  return existing.length >= effective.maxSessions ? existing : [];
}

/** 被挤方看到的一句话：谁、何时、在哪个终端 / 地点登录了 */
export function describeNewLogin(login: NewLoginContext): string {
  const where = login.location ? `${login.location} · ` : '';
  return `您的账号于 ${formatDateTime(login.loginAt)} 在 ${where}${SESSION_CLIENT_KIND_LABELS[login.client]} ${login.browser} / ${login.os} 登录，当前设备已退出。如非本人操作，请立即修改密码`;
}

function kickPayload(login: NewLoginContext): SessionForceLogoutPayload {
  return {
    code: 'concurrent-login',
    reason: describeNewLogin(login),
    by: {
      client: login.client,
      ip: login.ip,
      location: login.location,
      browser: login.browser,
      os: login.os,
      at: formatDateTime(login.loginAt),
    },
  };
}

/**
 * 新登录注册完成后执行：超出上限时挤掉最早登录的会话（`evictAll` 为拒绝模式下用户确认「下线其它设备」时全部挤掉）。
 * 返回被挤的会话，调用方据此写登录日志。拒绝模式下未经确认不挤人——并发登录竞争造成的短暂超额保持原样。
 */
export async function enforceSessionLimit(
  login: NewLoginContext,
  options: { policy?: SessionConcurrencyPolicy; evictAll?: boolean } = {},
): Promise<SessionInfo[]> {
  const policy = options.policy ?? await loadSessionPolicy(login.tenantId);
  if (policy.maxSessions === 0 && !options.evictAll) return [];
  if (policy.exceedAction === 'reject-new' && !options.evictAll) return [];

  const others = countedSessions(await listUserSessions(login.userId), policy, login.client, login.tokenId)
    .sort((a, b) => a.loginAt.getTime() - b.loginAt.getTime());
  const excess = options.evictAll ? others.length : others.length + 1 - policy.maxSessions;
  if (excess <= 0) return [];
  const victims = others.slice(0, excess);

  await revokeSessions(victims, 'concurrent-login');
  const payload = kickPayload(login);
  for (const victim of victims) {
    sendToToken(victim.tokenId, { type: 'session:force-logout', payload });
    // 先送达提示再关连接，与管理员强制下线一致
    setTimeout(() => closeTokenConnection(victim.tokenId, '被挤下线'), 500);
  }
  return victims;
}
