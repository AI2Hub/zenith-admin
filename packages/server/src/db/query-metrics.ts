import { AsyncLocalStorage } from 'node:async_hooks';

const observerScope = new AsyncLocalStorage<(elapsedMs: number) => void>();
export function withDbQueryObserver<T>(observer: (elapsedMs: number) => void, fn: () => Promise<T>): Promise<T> {
  return observerScope.run(observer, fn);
}

/**
 * postgres-js Query is lazy: unsafe()/values() construct it, then() executes it.
 * Measure from first execution until driver resolution, including queueing and decoding.
 * Transaction BEGIN/COMMIT sent internally by the driver are intentionally not counted.
 */
function observeQuery(value: unknown): unknown {
  const observer = observerScope.getStore();
  if (!observer || !value || typeof value !== 'object' || !('then' in value) || typeof value.then !== 'function') return value;
  const query = value as { then: (...args: unknown[]) => unknown };
  const then = query.then;
  let started = false;
  let finished = false;
  let began = 0;
  query.then = function (fulfilled: unknown, rejected: unknown) {
    if (!started) { started = true; began = performance.now(); }
    const finish = () => { if (!finished) { finished = true; observer(performance.now() - began); } };
    return Reflect.apply(then, query, [
      (result: unknown) => { finish(); return typeof fulfilled === 'function' ? fulfilled(result) : result; },
      (error: unknown) => { finish(); if (typeof rejected === 'function') return rejected(error); throw error; },
    ]);
  };
  return query;
}

/** Wrap the public client API, including transaction clients, without patching driver internals. */
export function instrumentPostgresClient<T extends object>(client: T): T {
  return new Proxy(client, {
    apply(target, thisArg, args) { return observeQuery(Reflect.apply(target as unknown as (...args: unknown[]) => unknown, thisArg, args)); },
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (property === 'begin' || property === 'savepoint') return (...args: unknown[]) => Reflect.apply(value, target, args.map(arg => typeof arg === 'function' ? (scoped: object) => arg(instrumentPostgresClient(scoped)) : arg));
      if (property === 'unsafe') return (...args: unknown[]) => observeQuery(Reflect.apply(value, target, args));
      return value.bind(target);
    },
  });
}
