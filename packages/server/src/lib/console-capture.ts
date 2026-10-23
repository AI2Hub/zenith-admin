/**
 * 将当前 Node 进程的六个常用 console 方法汇入应用日志。
 * 只接管 console API，不截获 stdout/stderr、原生扩展或子进程；Pino 自身的输出不会再次采集。
 * 安装由 logger 初始化完成后触发，测试可对独立 console 对象显式安装并恢复。
 */
import { formatWithOptions } from 'node:util';

const METHOD_LEVELS = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
  trace: 'debug',
} as const;

type ConsoleMethod = keyof typeof METHOD_LEVELS;
type ConsoleTarget = Pick<Console, ConsoleMethod>;
type ConsoleFields = { source: 'console'; consoleMethod: ConsoleMethod; err?: Error };
type ConsoleLogger = Record<typeof METHOD_LEVELS[ConsoleMethod], (fields: ConsoleFields, message: string) => void>;

const installations = new WeakMap<ConsoleTarget, () => void>();

/** 同一 console 对象只安装一次；返回的恢复函数幂等，且不会覆盖之后由其他代码替换的方法。 */
export function installConsoleCapture(logger: ConsoleLogger, target: ConsoleTarget = console): () => void {
  const installed = installations.get(target);
  if (installed) return installed;

  let writing = false;
  const originals = new Map<ConsoleMethod, ConsoleTarget[ConsoleMethod]>();
  const replacements = new Map<ConsoleMethod, ConsoleTarget[ConsoleMethod]>();

  for (const method of Object.keys(METHOD_LEVELS) as ConsoleMethod[]) {
    const original = target[method];
    const replacement = function capturedConsoleMethod(...args: unknown[]): void {
      // logger 的同步扩展（如异常采集 sink）若反过来调用 console，退回原输出，避免递归。
      if (writing) {
        original.apply(target, args);
        return;
      }
      writing = true;
      try {
        let message = formatWithOptions({ colors: false }, ...args);
        if (method === 'trace') {
          // console.trace 除正文外还打印调用栈；按诊断日志归入 debug，避免丢失这个语义。
          const trace = new Error(message);
          trace.name = 'Trace';
          Error.captureStackTrace(trace, capturedConsoleMethod);
          message = trace.stack ?? `Trace: ${message}`;
        }
        const err = args.find((arg): arg is Error => arg instanceof Error);
        logger[METHOD_LEVELS[method]]({ source: 'console', consoleMethod: method, ...(err ? { err } : {}) }, message);
      } catch {
        // 格式化或 logger 同步失败仍保留原始控制台输出。
        original.apply(target, args);
      } finally {
        writing = false;
      }
    };
    originals.set(method, original);
    replacements.set(method, replacement);
    target[method] = replacement;
  }

  const restore = () => {
    for (const [method, original] of originals) {
      if (target[method] === replacements.get(method)) target[method] = original;
    }
    if (installations.get(target) === restore) installations.delete(target);
  };
  installations.set(target, restore);
  return restore;
}
