import { AsyncLocalStorage } from 'node:async_hooks';

export interface CmsGenerationContext {
  siteId: number;
  generationId: number;
  candidate: boolean;
  buildAt?: Date;
}
const scope = new AsyncLocalStorage<CmsGenerationContext>();
export function cmsGenerationContext(): CmsGenerationContext | undefined { return scope.getStore(); }
export function cmsGenerationNow(): Date { return scope.getStore()?.buildAt ?? new Date(); }
export function withCmsGenerationContext<T>(context: CmsGenerationContext, fn: () => Promise<T>): Promise<T> {
  return scope.run(context, fn);
}
/** Definition caches have no generation dimension; scoped readers must bypass them. */
export function isCmsGenerationRead(): boolean { return scope.getStore() !== undefined; }
