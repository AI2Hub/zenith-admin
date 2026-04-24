import { eq } from 'drizzle-orm';
import { UAParser } from 'ua-parser-js';
import { db } from '../db';
import { users, loginLogs } from '../db/schema';
import { signToken } from '../lib/jwt';
import { generateTokenId } from '../lib/session-manager';
import type { JwtPayload } from '../middleware/auth';

// ─── 获取用户角色列表 ─────────────────────────────────────────────────────────

export async function getUserRoles(userId: number) {
  const result = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {},
    with: { userRoles: { columns: {}, with: { role: true } } },
  });
  return (result?.userRoles ?? []).map(({ role: r }) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ─── 签发 AccessToken + RefreshToken ─────────────────────────────────────────

export async function issueTokens(
  user: { id: number; username: string; tenantId?: number | null },
  roleCodes: string[],
) {
  const tokenId = generateTokenId();
  const tenantId = user.tenantId ?? null;
  const accessToken = await signToken<JwtPayload>(
    { userId: user.id, username: user.username, roles: roleCodes, tenantId, jti: tokenId },
    '2h',
  );
  const refreshToken = await signToken(
    { userId: user.id, username: user.username, type: 'refresh', tenantId, jti: tokenId },
    '30d',
  );
  return { accessToken, refreshToken, tokenId };
}

// ─── 记录登录日志 ─────────────────────────────────────────────────────────────

export interface LoginLogParams {
  username: string;
  status: 'success' | 'fail';
  message: string;
  userId?: number;
  tenantId?: number | null;
  ip: string;
  ua: string;
}

export async function recordLoginLog(params: LoginLogParams) {
  const { username, status, message, userId, tenantId, ip, ua } = params;
  const parser = new UAParser(ua);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  await db.insert(loginLogs).values({
    username,
    userId,
    ip,
    browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Unknown',
    os: os.name ? `${os.name} ${os.version || ''}`.trim() : 'Unknown',
    status,
    message,
    tenantId: tenantId ?? null,
  });
}

// ─── 从请求中提取客户端信息 ───────────────────────────────────────────────────

export function getClientInfo(headers: { get: (key: string) => string | null | undefined }) {
  const ip = headers.get('x-forwarded-for') || headers.get('x-real-ip') || '127.0.0.1';
  const ua = headers.get('user-agent') || '';
  return { ip, ua };
}
