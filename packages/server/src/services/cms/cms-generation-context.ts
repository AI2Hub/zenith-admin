import { AsyncLocalStorage } from 'node:async_hooks';

export interface CmsGenerationContext {
  siteId: number;
  generationId: number;
  candidate: boolean;
  buildAt?: Date;
  releaseId?: number;
  visibilityEpoch?: number;
  capturedVisibilityEpoch?: number;
}
export interface CmsDeliverySnapshot {
  generationId: number | null;
  releaseId: number | null;
  visibilityEpoch: number;
  capturedVisibilityEpoch: number | null;
}
const scope = new AsyncLocalStorage<CmsGenerationContext>();
const deliveryScope = new AsyncLocalStorage<CmsDeliverySnapshot>();
export function cmsGenerationContext(): CmsGenerationContext | undefined { return scope.getStore(); }
export function cmsDeliverySnapshot(): CmsDeliverySnapshot {
  const generation = scope.getStore();
  return generation ? {
    generationId: generation.generationId, releaseId: generation.releaseId ?? null,
    visibilityEpoch: generation.visibilityEpoch ?? 0, capturedVisibilityEpoch: generation.capturedVisibilityEpoch ?? 0,
  } : deliveryScope.getStore() ?? { generationId: null, releaseId: null, visibilityEpoch: 0, capturedVisibilityEpoch: null };
}
export function withCmsDeliverySnapshot<T>(snapshot: CmsDeliverySnapshot, fn: () => Promise<T>): Promise<T> {
  return deliveryScope.run(snapshot, fn);
}
export function cmsGenerationNow(): Date { return scope.getStore()?.buildAt ?? new Date(); }
export function withCmsGenerationContext<T>(context: CmsGenerationContext, fn: () => Promise<T>): Promise<T> {
  return scope.run(context, fn);
}
/** Definition caches have no generation dimension; scoped readers must bypass them. */
export function isCmsGenerationRead(): boolean { return scope.getStore() !== undefined; }
