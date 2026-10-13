/**
 * 日志类默认值的环境分档（见 config.ts 的 devLog）。
 *
 * 只有 `npm run dev` 注入的 NODE_ENV=development 才提高日志默认值（debug / 彩色单行 / HTTP 流量日志）；
 * 其余环境（test / production / 未设置）必须保持原有关闭与保守档位——这条边界是本次改动的核心，
 * 一旦回退，测试环境会被流量日志淹没、生产会被静默切换到 debug。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type ConfigModule = typeof import('./config');

const ENV_KEYS = [
  'NODE_ENV',
  'LOG_LEVEL',
  'LOG_CONSOLE_PRETTY',
  'LOG_SQL',
  'HTTP_LOG_INCOMING_ENABLED',
  'HTTP_LOG_OUTGOING_ENABLED',
  'HTTP_LOG_OUTGOING_LEVEL',
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<string, string | undefined>;

/** 重新加载 config（模块在加载期解析环境变量），逐键设置 / 清除指定环境变量 */
async function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): Promise<ConfigModule> {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`process.exit(${code})`); }) as never);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return import('./config');
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('日志默认值的环境分档', () => {
  it('开发模式：debug 级、彩色单行控制台、入站与出站流量日志开启（出站取 access）', async () => {
    const { config } = await loadConfig({ NODE_ENV: 'development' });
    expect(config.isDevelopment).toBe(true);
    expect(config.log.level).toBe('debug');
    expect(config.log.pretty).toBe(true);
    expect(config.httpLog.incoming.enabled).toBe(true);
    expect(config.httpLog.incoming.level).toBe('access');
    expect(config.httpLog.outgoing.enabled).toBe(true);
    expect(config.httpLog.outgoing.level).toBe('access');
  });

  it('SQL 明细日志不受开发档影响：默认关闭，需显式开启', async () => {
    expect((await loadConfig({ NODE_ENV: 'development' })).config.log.sql).toBe(false);
    expect((await loadConfig({ NODE_ENV: 'production' })).config.log.sql).toBe(false);
    expect((await loadConfig({ NODE_ENV: 'development', LOG_SQL: 'true' })).config.log.sql).toBe(true);
  });

  describe('assertRuntimeLogOptions', () => {
    it('LOG_SQL=true 而级别高于 debug 时告警（否则静默无输出）', async () => {
      const { assertRuntimeLogOptions } = await loadConfig({ NODE_ENV: 'production', LOG_SQL: 'true', LOG_LEVEL: 'info' });
      const log = { warn: vi.fn() };
      assertRuntimeLogOptions(log);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('LOG_SQL=true'));
    });

    it.each(['debug', 'trace'])('LOG_LEVEL=%s 时不告警', async (level) => {
      const { assertRuntimeLogOptions } = await loadConfig({ NODE_ENV: 'development', LOG_SQL: 'true', LOG_LEVEL: level });
      const log = { warn: vi.fn() };
      assertRuntimeLogOptions(log);
      expect(log.warn).not.toHaveBeenCalled();
    });

    it('LOG_SQL 未开启时任何级别都不告警', async () => {
      const { assertRuntimeLogOptions } = await loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'info' });
      const log = { warn: vi.fn() };
      assertRuntimeLogOptions(log);
      expect(log.warn).not.toHaveBeenCalled();
    });
  });

  it.each(['test', 'production', 'staging', undefined])(
    '非开发模式（NODE_ENV=%j）：沿用保守默认，流量日志保持关闭',
    async (nodeEnv) => {
      const { config } = await loadConfig({ NODE_ENV: nodeEnv });
      expect(config.isDevelopment).toBe(false);
      expect(config.log.level).toBe('info');
      expect(config.log.pretty).toBe(false);
      expect(config.httpLog.incoming.enabled).toBe(false);
      expect(config.httpLog.outgoing.enabled).toBe(false);
      // 出站生产档：显式开启时要的是 full（排查第三方集成），与开发档的 access 区分
      expect(config.httpLog.outgoing.level).toBe('full');
    },
  );

  it('显式环境变量优先于开发档（本地可随时降噪）', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'development',
      LOG_LEVEL: 'warn',
      LOG_CONSOLE_PRETTY: 'false',
      HTTP_LOG_INCOMING_ENABLED: 'false',
      HTTP_LOG_OUTGOING_ENABLED: 'false',
      HTTP_LOG_OUTGOING_LEVEL: 'full',
    });
    expect(config.log.level).toBe('warn');
    expect(config.log.pretty).toBe(false);
    expect(config.httpLog.incoming.enabled).toBe(false);
    expect(config.httpLog.outgoing.enabled).toBe(false);
    expect(config.httpLog.outgoing.level).toBe('full');
  });
});
