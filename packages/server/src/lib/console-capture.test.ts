import { pino, stdSerializers } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installConsoleCapture } from './console-capture';

const restores: Array<() => void> = [];
afterEach(() => {
  restores.splice(0).reverse().forEach((restore) => restore());
});

function createTarget() {
  return { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
}

function createOutput() {
  const lines: Array<{ level: number; msg: string; source?: string; consoleMethod?: string; err?: { stack: string } }> = [];
  const logger = pino({ level: 'trace', serializers: { err: stdSerializers.err } }, {
    write(chunk: string) { lines.push(JSON.parse(chunk) as typeof lines[number]); },
  });
  return { logger, lines };
}

describe('installConsoleCapture', () => {
  it('六个 console 方法各写入一次应用日志，直接 logger 调用不会被重复采集', () => {
    const { logger, lines } = createOutput();
    const target = createTarget();
    const originals = { ...target };
    restores.push(installConsoleCapture(logger, target));

    target.log('log');
    target.info('info');
    target.warn('warn');
    target.error('error');
    target.debug('debug');
    target.trace('trace');
    logger.info('direct');

    expect(lines.map((line) => line.level)).toEqual([30, 30, 40, 50, 20, 20, 30]);
    expect(lines.slice(0, 6).map((line) => line.consoleMethod)).toEqual(['log', 'info', 'warn', 'error', 'debug', 'trace']);
    expect(lines.slice(0, 6).every((line) => line.source === 'console')).toBe(true);
    expect(lines[6]).toMatchObject({ msg: 'direct' });
    expect(lines[6].source).toBeUndefined();
    Object.values(originals).forEach((original) => expect(original).not.toHaveBeenCalled());
  });

  it('保留 printf、多参数、对象和循环引用的控制台显示', () => {
    const { logger, lines } = createOutput();
    const target = createTarget();
    restores.push(installConsoleCapture(logger, target));
    target.log('用户 %s，耗时 %dms，数据 %j', '张三', 12, { ok: true });
    target.info('context', { id: 7 }, false, null, undefined);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    target.log(cyclic);
    target.log();
    expect(lines[0].msg).toBe('用户 张三，耗时 12ms，数据 {"ok":true}');
    expect(lines[1].msg).toBe('context { id: 7 } false null undefined');
    expect(lines[2].msg).toContain('[Circular');
    expect(lines[3].msg).toBe('');
  });

  it('Error 保留完整栈，同时进入现有 err 序列化和异常采集入口', () => {
    const { logger, lines } = createOutput();
    const target = createTarget();
    restores.push(installConsoleCapture(logger, target));
    const error = new Error('network failed');
    target.error('request %s failed', '/users', error, { attempt: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0].msg).toContain('request /users failed Error: network failed');
    expect(lines[0].msg).toContain('console-capture.test.ts');
    expect(lines[0].msg).toContain('{ attempt: 2 }');
    expect(lines[0].err?.stack).toBe(error.stack);
  });

  it('trace 展示调用者栈，且遵循 debug 级别过滤', () => {
    const { logger, lines } = createOutput();
    const target = createTarget();
    restores.push(installConsoleCapture(logger, target));
    target.trace('diagnostic %d', 42);
    expect(lines[0].msg).toMatch(/^Trace: diagnostic 42\n/);
    expect(lines[0].msg).toContain('console-capture.test.ts');
    expect(lines[0].msg).not.toContain('capturedConsoleMethod');
    logger.level = 'info';
    target.debug('filtered debug');
    target.trace('filtered trace');
    target.log('visible');
    expect(lines.map((line) => line.msg)).toHaveLength(2);
    expect(lines[1].msg).toBe('visible');
  });

  it('logger 失败时调用原 console，同步回调 console 时不递归', () => {
    const target = createTarget();
    const originals = { ...target };
    const sink = {
      info: vi.fn(() => { throw new Error('logger unavailable'); }),
      warn: vi.fn(),
      error: vi.fn(() => { target.warn('sink diagnostic'); }),
      debug: vi.fn(),
    };
    restores.push(installConsoleCapture(sink, target));
    const error = new Error('original cause');
    target.info('fallback %s', 'message', error);
    expect(originals.info).toHaveBeenCalledExactlyOnceWith('fallback %s', 'message', error);
    target.error('application error');
    expect(sink.error).toHaveBeenCalledTimes(1);
    expect(sink.warn).not.toHaveBeenCalled();
    expect(originals.warn).toHaveBeenCalledExactlyOnceWith('sink diagnostic');
    // 上一次写入失败后仍能继续采集，guard 已清理。
    target.warn('next entry');
    expect(sink.warn).toHaveBeenCalledTimes(1);
  });

  it('安装与恢复幂等，不覆盖后续替换的方法，也不修改全局 console', () => {
    const globalLog = console.log;
    const { logger, lines } = createOutput();
    const target = createTarget();
    const originalLog = target.log;
    const restore = installConsoleCapture(logger, target);
    restores.push(restore);
    expect(installConsoleCapture(logger, target)).toBe(restore);
    target.log('once');
    expect(lines).toHaveLength(1);
    const downstreamWarn = vi.fn();
    target.warn = downstreamWarn;
    restore();
    restore();
    expect(target.log).toBe(originalLog);
    expect(target.warn).toBe(downstreamWarn);
    expect(console.log).toBe(globalLog);
    target.log('original');
    expect(originalLog).toHaveBeenCalledExactlyOnceWith('original');
    expect(lines).toHaveLength(1);
  });
});
