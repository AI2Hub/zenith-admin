import { describe, expect, it } from 'vitest';
import { cmsBuildConnectionBudget, runCmsBuildBatch } from './cms-build-concurrency';

describe('bounded CMS target workers', () => {
  it('reserves owner/control connections and falls back to the owner connection for a two-connection pool', () => {
    expect(cmsBuildConnectionBudget(2)).toEqual({ concurrency: 1, independentReads: false, maxBuilds: 1 });
    expect(cmsBuildConnectionBudget(3)).toEqual({ concurrency: 1, independentReads: true, maxBuilds: 1 });
    expect(cmsBuildConnectionBudget(12)).toEqual({ concurrency: 4, independentReads: true, maxBuilds: 2 });
    expect(cmsBuildConnectionBudget(20, 1).concurrency).toBe(1);
    expect(() => cmsBuildConnectionBudget(1)).toThrow('至少需要 2');
  });
  it('caps in-flight work and processes each target exactly once', async () => {
    let active = 0; let peak = 0; const seen: number[] = [];
    await runCmsBuildBatch(Array.from({ length: 17 }, (_, index) => index), 3, async item => {
      active += 1; peak = Math.max(peak, active); await Promise.resolve(); seen.push(item); active -= 1;
    });
    expect(peak).toBe(3); expect(new Set(seen).size).toBe(17); expect(active).toBe(0);
  });
  it('waits for in-flight writers before returning a failure and starts no later targets', async () => {
    let finish!: () => void; const blocked = new Promise<void>(resolve => { finish = resolve; });
    const seen: number[] = []; let returned = false; const failure = new Error('target failed');
    const run = runCmsBuildBatch([1, 2, 3, 4], 2, async item => { seen.push(item); if (item === 1) throw failure; await blocked; }).catch(error => { returned = true; return error; });
    await Promise.resolve(); expect(returned).toBe(false); expect(seen).toEqual([1, 2]);
    finish(); expect(await run).toBe(failure); expect(seen).toEqual([1, 2]);
  });
  it('drains started targets before returning cancellation without scheduling the tail', async () => {
    const seen: number[] = [];
    const cancelled = await runCmsBuildBatch([1, 2, 3, 4], 2, async item => { seen.push(item); return true; });
    expect(cancelled).toBe(true); expect(seen).toEqual([1, 2]);
  });
});
