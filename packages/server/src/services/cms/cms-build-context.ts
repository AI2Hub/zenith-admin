import { AsyncLocalStorage } from 'node:async_hooks';
import type { CmsBuildPerformance } from '@zenith/shared/cms';
import { withDbQueryObserver } from '../../db/query-metrics';
import { cmsGenerationContext } from './cms-generation-context';

type Target = CmsBuildPerformance['slowestTargets'][number];
interface BuildContext { generationId: number; siteId: number; memo: Map<string, Promise<unknown>>; metrics: CmsBuildPerformance }
const buildScope = new AsyncLocalStorage<BuildContext>();
const targetScope = new AsyncLocalStorage<Target>();
export function isCmsFrozenBuild(): boolean {
  const scope = buildScope.getStore(); const generation = cmsGenerationContext();
  return !!scope && generation?.generationId === scope.generationId && generation.siteId === scope.siteId && generation.candidate && !!generation.buildAt;
}
export function newCmsBuildPerformance(concurrency: number): CmsBuildPerformance { return { concurrency, targetCount: 0, completedTargets: 0, queryCount: 0, queryMs: 0, renderMs: 0, fileMs: 0, checkpointMs: 0, checkpointFlushes: 0, sharedCacheHits: 0, sharedCacheMisses: 0, slowestTargets: [] }; }
export function withCmsBuildContext<T>(siteId: number, generationId: number, metrics: CmsBuildPerformance, fn: () => Promise<T>): Promise<T> {
  return buildScope.run({ siteId, generationId, metrics, memo: new Map() }, () => withDbQueryObserver(elapsed => {
    metrics.queryCount += 1; metrics.queryMs += elapsed;
    const target = targetScope.getStore();
    if (target) { target.queryCount += 1; target.queryMs += elapsed; }
  }, fn));
}
/** Only frozen build inputs may be memoized; public rendering retains live withdrawal checks. */
export function memoCmsBuild<T>(key: string, load: () => Promise<T>): Promise<T> {
  const scope = buildScope.getStore(); const generation = cmsGenerationContext();
  if (!scope || generation?.generationId !== scope.generationId || generation.siteId !== scope.siteId || !generation.candidate || !generation.buildAt) return load();
  const hit = scope.memo.get(key);
  if (hit) { scope.metrics.sharedCacheHits += 1; return hit as Promise<T>; }
  scope.metrics.sharedCacheMisses += 1;
  const pending = load(); scope.memo.set(key, pending);
  void pending.catch(() => { if (scope.memo.get(key) === pending) scope.memo.delete(key); });
  return pending;
}
export async function measureCmsBuildWork<T>(kind: 'renderMs' | 'fileMs' | 'checkpointMs', fn: () => Promise<T>): Promise<T> {
  const scope = buildScope.getStore(); if (!scope) return fn();
  const start = performance.now();
  try { return await fn(); } finally {
    const elapsed = performance.now() - start; scope.metrics[kind] += elapsed;
    const target = targetScope.getStore(); if (target && kind !== 'checkpointMs') target[kind] += elapsed;
  }
}
export async function withCmsBuildTargetMetrics<T>(key: string, fn: (target: Target) => Promise<T>): Promise<T> {
  const scope = buildScope.getStore();
  const target: Target = { key, elapsedMs: 0, queryCount: 0, queryMs: 0, renderMs: 0, fileMs: 0, outcome: 'generated' };
  if (!scope) return fn(target);
  const began = performance.now();
  return targetScope.run(target, async () => {
    try { return await fn(target); } catch (error) { target.outcome = 'failed'; throw error; }
    finally {
      target.elapsedMs = performance.now() - began;
      scope.metrics.completedTargets += target.outcome === 'failed' ? 0 : 1;
      scope.metrics.slowestTargets = [...scope.metrics.slowestTargets, target].sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 20);
    }
  });
}
