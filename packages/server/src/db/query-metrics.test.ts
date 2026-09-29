import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentPostgresClient, withDbQueryObserver } from './query-metrics';

class LazyQuery implements PromiseLike<unknown> {
  started = false;
  resolve!: (value: unknown) => void;
  reject!: (reason: unknown) => void;
  private readonly result = new Promise<unknown>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
  values() { return this; }
  then<TResult1 = unknown, TResult2 = never>(fulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null, rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    this.started = true;
    return this.result.then(fulfilled, rejected);
  }
}
interface QueryClient {
  (): LazyQuery;
  unsafe(): LazyQuery;
  begin<T>(fn: (client: QueryClient) => Promise<T>): Promise<T>;
  savepoint<T>(fn: (client: QueryClient) => Promise<T>): Promise<T>;
}
function clientFor(queries: LazyQuery[]): QueryClient {
  const take = () => { const query = queries.shift(); if (!query) throw new Error('No query fixture'); return query; };
  const client: QueryClient = Object.assign(take, { unsafe: vi.fn(take), begin: async <T>(fn: (client: QueryClient) => Promise<T>): Promise<T> => fn(client), savepoint: async <T>(fn: (client: QueryClient) => Promise<T>): Promise<T> => fn(client) });
  return client;
}
afterEach(() => vi.restoreAllMocks());
describe('scoped postgres query execution metrics', () => {
  it('keeps unobserved lazy query identity, values mode and result semantics unchanged', async () => {
    const query = new LazyQuery(); const client = instrumentPostgresClient(clientFor([query]));
    const returned = client.unsafe();
    expect(returned).toBe(query); expect(returned.values()).toBe(query); expect(query.started).toBe(false);
    query.resolve([{ id: 1 }]); expect(await returned).toEqual([{ id: 1 }]);
  });
  it('counts first execution through driver settlement once, excluding time spent constructing a query', async () => {
    let now = 10; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const seen: number[] = []; const query = new LazyQuery(); const client = instrumentPostgresClient(clientFor([query]));
    await withDbQueryObserver(ms => seen.push(ms), async () => {
      const returned = client.unsafe().values(); now = 1000;
      expect(seen).toEqual([]); expect(query.started).toBe(false);
      const first = returned.then(value => value); const second = returned.then(value => value);
      now = 1025; query.resolve('driver result');
      expect(await first).toBe('driver result'); expect(await second).toBe('driver result');
      expect(await returned).toBe('driver result');
    });
    expect(seen).toEqual([25]);
  });
  it('preserves rejection identity and measures the failed execution', async () => {
    let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const seen: number[] = []; const error = new Error('driver rejected'); const query = new LazyQuery();
    await withDbQueryObserver(ms => seen.push(ms), async () => {
      const result = instrumentPostgresClient(clientFor([query])).unsafe().then(value => value);
      now = 9; query.reject(error);
      await expect(result).rejects.toBe(error);
    });
    expect(seen).toEqual([9]);
  });
  it('keeps begin/savepoint callbacks, results and thrown errors while observing their scoped clients', async () => {
    const queries = [new LazyQuery(), new LazyQuery()]; const first = queries[0]; const second = queries[1];
    const seen: number[] = []; const client = instrumentPostgresClient(clientFor(queries));
    await withDbQueryObserver(ms => seen.push(ms), async () => {
      const result = client.begin(async tx => {
        const pending = tx.unsafe().then(value => value); first.resolve('outer');
        expect(await pending).toBe('outer');
        return tx.savepoint(async nested => { const pending = nested.unsafe().values().then(value => value); second.resolve('nested'); return pending; });
      });
      expect(await result).toBe('nested');
    });
    expect(seen).toHaveLength(2);
    const error = new Error('rollback callback');
    await expect(client.begin(async () => { throw error; })).rejects.toBe(error);
  });
  it('keeps independent concurrent observer scopes when their queries settle in reverse order', async () => {
    const first = new LazyQuery(); const second = new LazyQuery();
    const client = instrumentPostgresClient(clientFor([first, second])); const observations: string[] = [];
    const run = (key: string) => withDbQueryObserver(() => observations.push(key), async () => client.unsafe().then(value => value));
    const a = run('a'); const b = run('b');
    second.resolve('B'); expect(await b).toBe('B'); first.resolve('A'); expect(await a).toBe('A');
    expect(observations).toEqual(['b', 'a']);
  });
});
