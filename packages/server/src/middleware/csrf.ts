import type { Context } from 'hono';
import { csrf } from 'hono/csrf';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { matchedRoutes } from 'hono/route';
import { findTargetHandler } from 'hono/utils/handler';
import { readRouteFact } from '../lib/route-facts';

// 协议端点分别使用 SAML 校验、OAuth2 凭证或开放网关签名，不依赖 Cookie 会话。
const PROTOCOL_EXEMPT_PATHS = new Set([
  '/api/auth/enterprise/saml/acs',
  '/api/oauth2/token',
  '/api/oauth2/authorize',
]);

function isBearerApiRequest(c: Context): boolean {
  // 只兼容没有浏览器来源信息的调用；空 Origin / Origin: null 都不是缺失。
  if (c.req.header('Origin') !== undefined || c.req.header('Sec-Fetch-Site') !== undefined) return false;
  if (!/^Bearer [A-Za-z0-9._~+/-]+=*$/.test(c.req.header('Authorization') ?? '')) return false;

  const endpoint = matchedRoutes(c).find((route) => route.method !== 'ALL');
  if (!endpoint) return false;
  // 首个端点必须先执行 Bearer 门禁；后续同路径 / 参数路由的认证并不保证会执行。
  const fact = readRouteFact(findTargetHandler(endpoint.handler));
  return fact?.kind === 'auth' || fact?.kind === 'member-auth';
}

/** 来源检查与身份认证独立：豁免只进入后续门禁，不代表 Bearer 已验证。 */
export function createCsrfMiddleware({ allowedOrigins }: { allowedOrigins: readonly string[] }) {
  const checkCsrf = csrf({
    origin: (origin) => origin !== '' && origin !== 'null'
      && (allowedOrigins.length === 0 || allowedOrigins.includes(origin)),
  });

  return createMiddleware(async (c, next) => {
    if (!PROTOCOL_EXEMPT_PATHS.has(c.req.path) && !c.req.path.startsWith('/api/open/') && !isBearerApiRequest(c)) {
      try {
        // 单独运行来源检查，避免把下游认证 / 权限 / 业务的 403 改写成 CSRF 错误。
        await checkCsrf(c, async () => {});
      } catch (error) {
        if (error instanceof HTTPException && error.status === 403) {
          throw new HTTPException(403, { message: '请求来源校验失败', cause: error });
        }
        throw error;
      }
    }
    await next();
  });
}
