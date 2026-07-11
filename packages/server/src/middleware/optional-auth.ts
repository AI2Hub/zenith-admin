import { createMiddleware } from 'hono/factory';
import { jwt } from 'hono/jwt';
import { config } from '../config';
import type { AuthEnv, JwtPayload } from './auth';
import type { MemberJwtPayload } from './member-auth';

const jwtMiddleware = jwt({ secret: config.jwtSecret, alg: 'HS256' });

/**
 * 可选认证中间件：用于既支持匿名又支持登录的采集类接口（埋点上报 / 错误上报）。
 * - 携带有效管理员 token → 解析并注入 `user`（c.set('user')）。
 * - 携带有效会员 token（payload.type === 'member' 且含 memberId）→ 解析并注入 `member`
 *   （c.set('member')），与后台身份互斥。采集接口高频调用，此处刻意不复用
 *   memberAuthMiddleware 的黑名单校验 / 会话续期逻辑，避免额外 Redis 往返（best-effort 采集场景可接受）。
 * - 无 token、token 无效，或两种身份均不满足时不报错，按匿名继续。
 */
export const optionalAuthMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authorization = c.req.header('Authorization');
  if (authorization?.startsWith('Bearer ')) {
    try {
      await jwtMiddleware(c, async () => {});
      const payload = c.get('jwtPayload') as (JwtPayload | MemberJwtPayload) & { type?: string };
      if (payload?.type === 'member') {
        const memberPayload = payload as MemberJwtPayload;
        if (memberPayload.memberId != null) {
          c.set('member', memberPayload);
        }
      } else if (payload) {
        c.set('user', payload as JwtPayload);
      }
    } catch {
      // 忽略无效 token，按匿名处理
    }
  }
  await next();
});