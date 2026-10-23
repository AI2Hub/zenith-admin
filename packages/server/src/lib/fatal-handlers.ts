/**
 * 进程级致命错误兜底（uncaughtException / unhandledRejection）。
 *
 * 职责是「崩溃可观测」，不是「阻止崩溃」：记录后必定 exit(1)，绝不吞错继续运行——
 * 崩溃态进程状态未定义，而崩溃恢复本就由既有机制兜底（事务性 outbox 补投、
 * 任务心跳回收、启动时 reconcile、容器 restart 策略）。
 *
 * 本模块由 index.ts 的第一条 import 触发自装，且只静态依赖 Node 内置模块——
 * 后续模块图（config / logger / 路由 / 服务）在加载阶段抛错同样会被兜住；
 * logger 与 telemetry 仅在 handler 内动态 import，加载失败自动降级为纯 stderr。
 *
 * 崩溃哨兵写入 {LOG_DIR}/crashes/，由下一次启动的 replayCrashSentinelsOnStartup()
 * （services/platform/crash-report.service）读取并经通知中心补投告警：
 * 垂死进程里做异步 I/O 不可靠，健康的新进程才是可靠的发件人。
 */
import fs from 'node:fs';
import path from 'node:path';

// 本模块最先加载：保留未被应用 console 采集层接管的 stderr 输出。
// fatal 的同步留痕不能依赖 logger/transport 健康，也不能被 LOG_LEVEL 屏蔽。
const emergencyConsoleError = console.error.bind(console);

export type CrashKind = 'uncaughtException' | 'unhandledRejection';

export interface CrashRecord {
  kind: CrashKind;
  message: string;
  stack: string | null;
  /** ISO 格式；仅哨兵内部使用，补投展示时再转统一时间格式 */
  crashedAt: string;
  pid: number;
  uptimeSec: number;
  nodeVersion: string;
}

/** 尽力 flush（pino worker transport / OTel span 批）留出的窗口，到点无条件退出 */
const FLUSH_DEADLINE_MS = 3_000;

let fatalInProgress = false;

/** 供 index.ts 的信号处理判断：fatal 处理期间收到 SIGTERM/SIGINT 不得进入优雅停机路径 */
export function isFatalShutdownInProgress(): boolean {
  return fatalInProgress;
}

/**
 * 崩溃哨兵目录。LOG_DIR 默认值与 config.ts 保持一致，但这里直接读 env、
 * 不 import config——config（dotenv/zod）加载失败正是本模块要兜住的场景之一。
 */
export function crashSentinelDir(): string {
  return path.join(process.env.LOG_DIR || 'logs', 'crashes');
}

function stringifyCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return String(cause);
  }
}

/** 规范化崩溃原因：unhandledRejection 的 reason 可能是任意值，不一定是 Error */
export function buildCrashRecord(kind: CrashKind, cause: unknown): CrashRecord {
  return {
    kind,
    message: stringifyCause(cause),
    stack: cause instanceof Error ? cause.stack ?? null : null,
    crashedAt: new Date().toISOString(),
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    nodeVersion: process.version,
  };
}

/** 同步写崩溃哨兵；失败只能退回 stderr（此时 logger 未必可用），不影响退出流程 */
export function writeCrashSentinel(record: CrashRecord): string | null {
  try {
    const dir = crashSentinelDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `crash-${Date.now()}-${record.pid}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2));
    return file;
  } catch (err) {
    try {
      emergencyConsoleError('[fatal] 崩溃哨兵写入失败:', err);
    } catch { /* stderr 都不可用时无事可做 */ }
    return null;
  }
}

function handleFatal(kind: CrashKind, cause: unknown): void {
  if (fatalInProgress) {
    // 处理期间再次致命（flush 链路自身抛错等）：不再做任何清理，立即退出防递归
    try {
      emergencyConsoleError('[fatal] re-entered during fatal handling, exiting immediately:', cause);
    } catch { /* noop */ }
    process.exit(1);
  }
  fatalInProgress = true;
  process.exitCode = 1;

  // ── 同步动作：崩溃态下唯一可靠的留痕 ──────────────────────────────────────
  try {
    emergencyConsoleError(`[fatal] ${kind}:`, cause);
  } catch { /* noop */ }
  const record = buildCrashRecord(kind, cause);
  writeCrashSentinel(record);

  // ── 尽力动作：限时冲刷结构化日志与遥测后退出 ─────────────────────────────
  // 硬闸计时器刻意不 unref：flush 期间必须有 ref 的 handle 撑住事件循环，
  // 否则 handler 返回后进程可能在冲刷完成前自然退出
  setTimeout(() => process.exit(1), FLUSH_DEADLINE_MS);
  void (async () => {
    try {
      const { default: logger } = await import('./logger');
      logger.fatal({ err: cause instanceof Error ? cause : undefined, crash: record }, `[fatal] process ${kind}`);
    } catch { /* logger 不可用（如 config 加载失败），stderr 已有记录 */ }
    try {
      const { shutdownTelemetry } = await import('./telemetry');
      await shutdownTelemetry();
    } catch { /* 未启用或已损坏，放弃 flush */ }
    // 留一拍让 pino worker transport 接收并落盘 fatal 行，再主动退出
    setTimeout(() => process.exit(1), 300);
  })();
}

let installed = false;

export function installFatalHandlers(): void {
  if (installed) return;
  installed = true;
  process.on('uncaughtException', (err) => handleFatal('uncaughtException', err));
  process.on('unhandledRejection', (reason) => handleFatal('unhandledRejection', reason));
}

// import 即生效（保证「第一条 import 就已兜底」）；vitest 进程除外——
// 测试运行器自行管理未捕获错误，这里注册会把测试进程直接 exit(1)
if (!process.env.VITEST) {
  installFatalHandlers();
}
