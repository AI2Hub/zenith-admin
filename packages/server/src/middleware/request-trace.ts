import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { runWithTraceId } from '../lib/context';

/**
 * 为每个请求建立链路关联 traceId（贯穿其触发的全部工作流作业/事件 fan-out）。
 *
 * - 支持客户端通过 `X-Trace-Id` 头透传（≤64 字符），否则生成一枚 UUID；
 * - 回写 `X-Trace-Id` 响应头，便于前端/网关与作业链路对齐；
 * - 用 `runWithTraceId` 包裹 `next()`，使下游 `enqueueJob` / 事件 outbox 自动继承该 traceId。
 */
export const requestTraceMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header('x-trace-id');
  const traceId = incoming && incoming.length > 0 && incoming.length <= 64 ? incoming : randomUUID();
  c.header('X-Trace-Id', traceId);
  await runWithTraceId(traceId, () => next());
};
