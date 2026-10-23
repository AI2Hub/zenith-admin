import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCrashRecord, crashSentinelDir, writeCrashSentinel } from './fatal-handlers';

const originalLogDir = process.env.LOG_DIR;

afterEach(() => {
  if (originalLogDir === undefined) delete process.env.LOG_DIR;
  else process.env.LOG_DIR = originalLogDir;
});

describe('crashSentinelDir', () => {
  it('跟随 LOG_DIR 环境变量', () => {
    process.env.LOG_DIR = path.join('custom', 'log-dir');
    expect(crashSentinelDir()).toBe(path.join('custom', 'log-dir', 'crashes'));
  });

  it('未设置 LOG_DIR 时使用与 config 一致的默认值 logs', () => {
    delete process.env.LOG_DIR;
    expect(crashSentinelDir()).toBe(path.join('logs', 'crashes'));
  });
});

describe('buildCrashRecord', () => {
  it('Error 原因：提取 message 与 stack，并带进程元信息', () => {
    const record = buildCrashRecord('uncaughtException', new Error('boom'));
    expect(record.kind).toBe('uncaughtException');
    expect(record.message).toBe('boom');
    expect(record.stack).toContain('boom');
    expect(record.pid).toBe(process.pid);
    expect(record.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(new Date(record.crashedAt).getTime())).toBe(false);
  });

  it('字符串 reason（unhandledRejection 可能不是 Error）', () => {
    const record = buildCrashRecord('unhandledRejection', 'plain rejection');
    expect(record.message).toBe('plain rejection');
    expect(record.stack).toBeNull();
  });

  it('普通对象 reason 序列化为 JSON', () => {
    const record = buildCrashRecord('unhandledRejection', { code: 'E_FAIL' });
    expect(record.message).toBe('{"code":"E_FAIL"}');
  });

  it('循环引用对象降级为 String()，不抛错', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const record = buildCrashRecord('unhandledRejection', cyclic);
    expect(record.message).toBe(String(cyclic));
  });

  it('undefined reason 不抛错', () => {
    const record = buildCrashRecord('unhandledRejection', undefined);
    expect(record.message).toBe('undefined');
  });
});

describe('writeCrashSentinel', () => {
  it('console 被采集层替换且 logger 不可用时，仍调用安装前的 stderr 兜底', async () => {
    const emergencyOutput = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const { writeCrashSentinel: writeWithEmergencyOutput } = await import('./fatal-handlers');
    const capturedConsoleError = vi.fn(() => { throw new Error('logger unavailable'); });
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    console.error = capturedConsoleError;
    try {
      expect(writeWithEmergencyOutput(buildCrashRecord('uncaughtException', new Error('crash')))).toBeNull();
      expect(emergencyOutput).toHaveBeenCalledExactlyOnceWith('[fatal] 崩溃哨兵写入失败:', expect.any(Error));
      expect(capturedConsoleError).not.toHaveBeenCalled();
    } finally {
      mkdir.mockRestore();
      console.error = emergencyOutput;
      emergencyOutput.mockRestore();
    }
  });

  it('同步写入哨兵文件并可完整读回', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatal-handlers-'));
    process.env.LOG_DIR = tmp;
    const record = buildCrashRecord('uncaughtException', new Error('sentinel test'));
    const file = writeCrashSentinel(record);
    expect(file).not.toBeNull();
    expect(path.dirname(file!)).toBe(path.join(tmp, 'crashes'));
    expect(path.basename(file!)).toMatch(/^crash-\d+-\d+\.json$/);
    const parsed = JSON.parse(fs.readFileSync(file!, 'utf8')) as ReturnType<typeof buildCrashRecord>;
    expect(parsed).toEqual(record);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('目录不可写时返回 null 而不抛错', () => {
    // 把一个普通文件当作 LOG_DIR：mkdirSync 必然失败
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatal-handlers-'));
    const blocker = path.join(tmp, 'not-a-dir');
    fs.writeFileSync(blocker, 'x');
    process.env.LOG_DIR = blocker;
    const file = writeCrashSentinel(buildCrashRecord('uncaughtException', new Error('x')));
    expect(file).toBeNull();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
