import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { consoleLogContract } from '@zenith/shared/ops';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import logger from '../../lib/logger';
import { getConsoleLogSources, readConsoleLogLines, tailConsoleLogLines } from '../../services/ops/console-logs.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const sourcesRoute = defineContractRoute(consoleLogContract.sources, {
  handler: async (c) => c.json(okBody(await getConsoleLogSources()), 200),
});

const contentRoute = defineContractRoute(consoleLogContract.content, {
  handler: async (c) => c.json(okBody({ lines: await readConsoleLogLines(c.req.valid('query')) }), 200),
});

const tailRoute = defineContractRoute(consoleLogContract.tail, {
  handler: async (c) => {
    const query = c.req.valid('query');
    const cursor = c.req.valid('header')['last-event-id'];
    return streamSSE(c, async (stream) => {
      const stop = new AbortController();
      stream.onAbort(() => stop.abort());
      const onRequestAbort = () => stream.abort();
      c.req.raw.signal.addEventListener('abort', onRequestAbort, { once: true });
      if (c.req.raw.signal.aborted) stream.abort();
      const signal = AbortSignal.any([c.req.raw.signal, stop.signal]);
      // 日志与心跳共用串行写入，浏览器慢读时不会交错 SSE 帧。
      let writes = Promise.resolve();
      const send = (message: { event: string; data: string; id?: string }) => {
        writes = writes.then(() => stream.writeSSE(message));
        return writes;
      };
      const heartbeat = setInterval(() => {
        void send({ event: 'ping', data: '' }).catch(() => stop.abort());
      }, 15_000);
      try {
        await tailConsoleLogLines(query, signal, ({ line, id }) => send({ event: 'log', data: line, id }), cursor);
      } catch (error) {
        if (!signal.aborted) {
          logger.error({ err: error }, '后端运行日志追踪失败');
          await send({ event: 'error', data: '无法读取后端运行日志，请检查日志目录权限或服务端错误记录' });
        }
      } finally {
        clearInterval(heartbeat);
        c.req.raw.signal.removeEventListener('abort', onRequestAbort);
        stop.abort();
        if (!stream.aborted) await writes.catch(() => {});
      }
    });
  },
});

router.openapiRoutes([sourcesRoute, contentRoute, tailRoute] as const);

export default router;
