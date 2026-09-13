/**
 * 沿 `app.routes` 读出每个端点实际生效的门禁事实（认证 / 权限码 / 平台超管 / 审计 / 功能门控）。
 * 依赖 `lib/route-facts.ts` 给中间件挂的自描述标记，不解析路由源码。
 */
import { readRouteFact } from '../lib/route-facts';

export interface RouteAccessFacts {
  auth: boolean;
  /** 权限码（任一即可）；无 guard 权限 → null */
  permission: string[] | null;
  platformOnly: false | true | 'multi-tenant';
  audit: Record<string, unknown> | null;
  feature: string | null;
  /** 认证之前的未标记中间件数（限流 / IP 校验等） */
  preAuthCount: number;
  /** 认证之后的未标记条目数（含 zod 校验器与最终 handler；多出来的即路由级追加中间件） */
  postAuthCount: number;
  /** 标记过的门禁条目数：契约装配的链上 auth ≤ 1、platform ≤ 1、guard ≤ 1，多出来的是路由里手写的门禁 */
  gateCounts: { auth: number; platform: number; guard: number };
}

export interface RouteEntryLike {
  method: string;
  path: string;
  handler: unknown;
}

/** `METHOD /path/:id` → 事实；只含真正的端点（method !== 'ALL'） */
export function collectRouteAccessFacts(routes: readonly RouteEntryLike[]): Map<string, RouteAccessFacts> {
  const facts = new Map<string, RouteAccessFacts>();
  for (const route of routes) {
    if (route.method === 'ALL') continue;
    const key = `${route.method} ${route.path}`;
    const current = facts.get(key) ?? {
      auth: false, permission: null, platformOnly: false, audit: null, feature: null, preAuthCount: 0, postAuthCount: 0,
      gateCounts: { auth: 0, platform: 0, guard: 0 },
    };
    const fact = readRouteFact(route.handler);
    if (!fact) {
      if (current.auth) current.postAuthCount += 1;
      else current.preAuthCount += 1;
    } else if (fact.kind === 'auth') {
      current.auth = true;
      current.gateCounts.auth += 1;
    } else if (fact.kind === 'guard') {
      current.gateCounts.guard += 1;
      if (fact.permission) current.permission = [...(current.permission ?? []), ...fact.permission];
      if (fact.audit) current.audit = fact.audit;
      if (fact.feature) current.feature = fact.feature;
    } else if (fact.kind === 'platform') {
      current.gateCounts.platform += 1;
      current.platformOnly = fact.onlyInMultiTenant ? 'multi-tenant' : true;
    }
    facts.set(key, current);
  }
  // 未标记条目包含 zod 校验器与最终 handler：它们都排在门禁之后，preAuthCount 只计认证之前的部分；
  // 未挂认证的端点（公开 / 其它凭证）把整条链算成 preAuth 没有意义，归零
  for (const value of facts.values()) if (!value.auth) value.preAuthCount = 0;
  return facts;
}
