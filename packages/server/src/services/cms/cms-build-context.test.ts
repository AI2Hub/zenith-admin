import { describe, expect, it } from 'vitest';
import { instrumentPostgresClient } from '../../db/query-metrics';
import { withCmsGenerationContext } from './cms-generation-context';
import { memoCmsBuild, newCmsBuildPerformance, withCmsBuildContext, withCmsBuildTargetMetrics } from './cms-build-context';

describe('frozen build context', () => {
  it('shares promises within one frozen generation, without leaking to other builds or public reads', async () => {
    let reads = 0; const load = async () => ({ value: ++reads });
    const context = { siteId: 1, generationId: 5, candidate: true, buildAt: new Date() };
    await withCmsBuildContext(1, 5, newCmsBuildPerformance(4), () => withCmsGenerationContext(context, async () => {
      const [a, b] = await Promise.all([memoCmsBuild('same', load), memoCmsBuild('same', load)]);
      expect(a).toBe(b); expect(reads).toBe(1);
      await withCmsGenerationContext({ ...context, candidate: false }, () => memoCmsBuild('same', load));
      await withCmsGenerationContext({ ...context, generationId: 6 }, () => memoCmsBuild('same', load));
      expect(reads).toBe(3);
    }));
    await withCmsBuildContext(1, 5, newCmsBuildPerformance(1), () => withCmsGenerationContext(context, () => memoCmsBuild('same', load)));
    expect(reads).toBe(4);
  });
  it('evicts rejected memo promises so transient failures can be retried', async () => {
    const context = { siteId: 1, generationId: 5, candidate: true, buildAt: new Date() };
    await withCmsBuildContext(1, 5, newCmsBuildPerformance(1), () => withCmsGenerationContext(context, async () => {
      await expect(memoCmsBuild('retry', async () => { throw new Error('first read'); })).rejects.toThrow('first read');
      expect(await memoCmsBuild('retry', async () => 42)).toBe(42);
    }));
  });
  it('attributes concurrent SQL execution to the owning target without combining target scopes', async () => {
    const metrics = newCmsBuildPerformance(2);
    const client = instrumentPostgresClient(Object.assign(() => undefined, { unsafe: () => { const result = Promise.resolve([{ id: 1 }]); return { then: result.then.bind(result) }; } }));
    await withCmsBuildContext(1, 2, metrics, () => Promise.all([
      withCmsBuildTargetMetrics('one', async () => { await client.unsafe(); return 1; }),
      withCmsBuildTargetMetrics('two', async () => { await client.unsafe(); await client.unsafe(); return 2; }),
    ]));
    expect(metrics.queryCount).toBe(3);
    expect(metrics.slowestTargets.find(row => row.key === 'one')?.queryCount).toBe(1);
    expect(metrics.slowestTargets.find(row => row.key === 'two')?.queryCount).toBe(2);
  });
});
