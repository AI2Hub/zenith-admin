import { mockUsers, type MockUser } from '@/mocks/data/users';
import { mockMenus } from '@/mocks/data/menus';

export const MOCK_TOKEN_PREFIX = 'mock-access-token';
export const MOCK_REFRESH_TOKEN_PREFIX = 'mock-refresh-token';

/** 模拟登录声明（Demo 模式）：与服务端 JwtPayload.impersonation 同形，另带展示所需的到期 / 原因 */
export interface MockImpersonationClaim {
  id: number;
  byUserId: number;
  byUsername: string;
  readOnly: boolean;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

interface MockTokenClaims { username: string; viewingTenantId?: number | null; impersonation?: MockImpersonationClaim }
export interface MockSession { user: MockUser; viewingTenantId?: number | null; impersonation?: MockImpersonationClaim }

export const mockAccessToken = (username: string, viewingTenantId?: number | null, impersonation?: MockImpersonationClaim) =>
  `${MOCK_TOKEN_PREFIX}:${JSON.stringify({ username, viewingTenantId, ...(impersonation ? { impersonation } : {}) })}`;
export const mockRefreshToken = (username: string, viewingTenantId?: number | null) =>
  `${MOCK_REFRESH_TOKEN_PREFIX}:${JSON.stringify({ username, viewingTenantId })}`;

export function resolveMockSession(token: string | null | undefined, prefix = MOCK_TOKEN_PREFIX): MockSession | null {
  if (!token) return null;
  let claims: MockTokenClaims;
  if (token === prefix) claims = { username: 'admin' };
  else if (token.startsWith(`${prefix}:`)) {
    const payload = token.slice(prefix.length + 1);
    try {
      claims = payload.startsWith('{') ? JSON.parse(payload) as MockTokenClaims : { username: payload };
    } catch { return null; }
  } else return null;
  const user = mockUsers.find((item) => item.username === claims.username && item.status === 'enabled');
  if (!user) return null;
  if (claims.viewingTenantId != null && (!Number.isInteger(claims.viewingTenantId) || claims.viewingTenantId <= 0)) return null;
  if (claims.viewingTenantId != null && !isMockPlatformAdmin(user)) return null;
  // 模拟令牌只在 access token 上出现；refresh token 携带该声明一律无效（与服务端一致：模拟会话不可续签）
  if (claims.impersonation && prefix === MOCK_REFRESH_TOKEN_PREFIX) return null;
  return { user, viewingTenantId: claims.viewingTenantId, impersonation: claims.impersonation };
}

export function currentMockSession(request: Request): MockSession | null {
  const authorization = request.headers.get('Authorization');
  return resolveMockSession(authorization?.startsWith('Bearer ') ? authorization.slice(7) : null);
}

export function isMockPlatformAdmin(user: MockUser): boolean {
  return (user.tenantId ?? null) === null && user.roles.some((role) => role.code === 'super_admin' && role.status === 'enabled');
}

export function mockUserPermissions(user: MockUser): string[] {
  if (isMockPlatformAdmin(user)) return ['*'];
  const ids = new Set(user.roles.filter((role) => role.status === 'enabled').flatMap((role) => role.menuIds ?? []));
  return mockMenus.flatMap((menu) => ids.has(menu.id) && menu.status === 'enabled' && menu.permission ? [menu.permission] : []);
}
