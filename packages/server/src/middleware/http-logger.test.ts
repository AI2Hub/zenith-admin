/**
 * 入站 HTTP 流量日志中间件。
 *
 * 关注两件容易出错、又直接决定「日志里能不能看到请求数据」的事：
 *  1. 请求目标是否带上查询串 —— GET 不带请求体，查询参数就是它的全部入参；
 *  2. body 档是否真的记下请求体与响应体，且敏感字段被脱敏。
 *
 * 配置与写入端都做替身：这里验证的是中间件的采集口径，落盘行为由 lib/http-logger 自己的用例负责。
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const httpLogConfig = vi.hoisted(() => ({
  enabled: true,
  level: 'access' as string,
  methods: {} as Record<string, string>,
  format: 'json' as string,
  maxBodyBytes: 65536,
  logResponseBody: false,
  excludePaths: [] as string[],
  separateFile: false,
}));

// 只替换 httpLog.incoming；log / otel 保持可用的最小形状——lib/http-logger 会间接加载
// lib/logger，那里在加载期与 mixin 里读 config.log 与 config.otel。
vi.mock('../config', () => ({
  config: {
    log: { level: 'silent', dir: 'logs', maxFiles: 1, pretty: false, sql: false },
    otel: { enabled: false },
    httpLog: { incoming: httpLogConfig },
  },
}));
vi.mock('../lib/http-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/http-logger')>();
  return { ...actual, writeHttpLogEntry: vi.fn() };
});

const { httpLoggerMiddleware } = await import('./http-logger');
const { writeHttpLogEntry } = await import('../lib/http-logger');

const writeMock = writeHttpLogEntry as unknown as Mock;

/** 记录下本次请求写入的全部条目 */
interface CapturedEntry {
  phase: string;
  url: string;
  requestBody?: unknown;
  responseBody?: unknown;
  statusCode?: number;
}

function makeApp() {
  const app = new Hono();
  app.use('*', httpLoggerMiddleware);
  app.all('*', (c) => c.json({ ok: true, path: c.req.path }, 200));
  return app;
}

function entries(): CapturedEntry[] {
  return writeMock.mock.calls.map((call) => call[0] as CapturedEntry);
}

function requestEntry(): CapturedEntry {
  return entries().find((e) => e.phase === 'request')!;
}

beforeEach(() => {
  writeMock.mockClear();
  httpLogConfig.enabled = true;
  httpLogConfig.level = 'access';
  httpLogConfig.methods = {};
  httpLogConfig.logResponseBody = false;
  httpLogConfig.maxBodyBytes = 65536;
  httpLogConfig.excludePaths = [];
});

describe('请求目标（路径 + 查询串）', () => {
  it('查询串被完整记入 url：GET 的入参不再凭空消失', async () => {
    await makeApp().request('/api/users?page=1&pageSize=20&keyword=alice');
    expect(requestEntry().url).toBe('/api/users?page=1&pageSize=20&keyword=alice');
    // 响应条目用同一个请求目标，便于与请求行配对
    expect(entries().find((e) => e.phase === 'response')!.url)
      .toBe('/api/users?page=1&pageSize=20&keyword=alice');
  });

  it('无查询串时保持纯路径，不出现多余分隔符', async () => {
    await makeApp().request('/api/users');
    expect(requestEntry().url).toBe('/api/users');
  });

  it('排除判断只看路径：带查询串的基础设施请求同样不记录', async () => {
    await makeApp().request('/api/health?verbose=1');
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('超长查询串被截断到记录上限，避免单行膨胀', async () => {
    await makeApp().request(`/api/users?filter=${'x'.repeat(3000)}`);
    expect(requestEntry().url).toHaveLength(2048);
    expect(requestEntry().url.startsWith('/api/users?filter=')).toBe(true);
  });
});

describe('body 档：请求体与响应体', () => {
  it.each(['body', 'full'])('控制台日志在 %s 档也不记录请求/响应，避免读取结果重新写回日志', async (level) => {
    httpLogConfig.level = level;
    httpLogConfig.logResponseBody = true;
    for (const target of ['/api/console-logs', '/api/console-logs/content?role=api&lines=500', '/api/console-logs/tail?role=api']) {
      await makeApp().request(target);
    }
    expect(writeMock).not.toHaveBeenCalled();
    // 排除规则不影响其他业务接口的响应采集。
    await makeApp().request('/api/users');
    expect(entries().find((entry) => entry.phase === 'response')!.responseBody).toEqual({ ok: true, path: '/api/users' });
  });

  it('记录请求体，并按键名脱敏敏感字段', async () => {
    httpLogConfig.level = 'body';
    await makeApp().request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'p@ssw0rd', token: 'abc' }),
    });
    expect(requestEntry().requestBody).toEqual({ username: 'admin', password: '***', token: '***' });
  });

  it('开启 logResponseBody 时记录响应体', async () => {
    httpLogConfig.level = 'body';
    httpLogConfig.logResponseBody = true;
    await makeApp().request('/api/users?page=1');
    expect(entries().find((e) => e.phase === 'response')!.responseBody).toEqual({ ok: true, path: '/api/users' });
  });

  it('未开启 logResponseBody 时不克隆、不记录响应体', async () => {
    httpLogConfig.level = 'body';
    await makeApp().request('/api/users');
    expect(entries().find((e) => e.phase === 'response')!.responseBody).toBeUndefined();
  });

  it('access 档不采集任何 body', async () => {
    await makeApp().request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin' }),
    });
    expect(requestEntry().requestBody).toBeUndefined();
  });

  it('方法级覆盖优先于全局档位', async () => {
    httpLogConfig.level = 'body';
    httpLogConfig.methods = { GET: 'access' };
    await makeApp().request('/api/users?page=1');
    expect(entries().find((e) => e.phase === 'response')!.responseBody).toBeUndefined();
    // 档位降到 access 后查询串仍在 url 上——GET 的入参与档位无关
    expect(requestEntry().url).toBe('/api/users?page=1');
  });
});
