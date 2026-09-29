export function cmsBuildConnectionBudget(maxConnections: number, requested = 4) {
  if (maxConnections < 2) throw new Error('CMS 发布构建至少需要 2 个数据库连接（构建与取消/检查点控制）');
  if (!Number.isSafeInteger(requested) || requested < 1) throw new Error('CMS 构建并发数必须为正整数');
  return { concurrency: Math.min(4, requested, Math.max(1, maxConnections - 2)), independentReads: maxConnections > 2, maxBuilds: Math.max(1, Math.floor(maxConnections / 6)) };
}

/** Stop scheduling on failure/cancellation, then drain every in-flight target before releasing the owner lock. */
export async function runCmsBuildBatch<T>(items: readonly T[], concurrency: number, run: (item: T) => Promise<boolean | void>): Promise<boolean> {
  let next = 0; let cancelled = false; let failed = false; let firstError: unknown;
  const workers = Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, async () => {
    while (!cancelled && !failed && next < items.length) {
      const item = items[next++];
      try { if (await run(item)) cancelled = true; }
      catch (error) { if (!failed) firstError = error; failed = true; }
    }
  });
  await Promise.all(workers);
  if (failed) throw firstError;
  return cancelled;
}
