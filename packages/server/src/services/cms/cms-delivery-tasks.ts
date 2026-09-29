import { and, eq, sql } from 'drizzle-orm';
import type { CmsDeliveryObservation } from '@zenith/shared/cms';
import { db } from '../../db';
import { asyncTasks, cmsDeliveryRuns, cmsDeliveryStates } from '../../db/schema';
import type { CmsDeliveryRunRow } from '../../db/schema';
import { registerTaskHandler, TaskCancelledError, type TaskRunContext } from '../../lib/task-center';
import { cmsCurrentDeliveryIdentity, CMS_DELIVERY_TASK } from './cms-delivery-records';
import { cmsDeliverySourceAllowlist } from './cms-delivery.service';
import { resolveEffectiveCmsSiteRow } from './cms-site-inheritance.service';
import { sendCmsCdnPurge } from './cms-cdn.service';
import { probeCmsDeliveryAsset, probeCmsDeliveryTarget } from './cms-delivery-probe';

function assetUrl(raw: string | null | undefined, base: string | null): string | null {
  if (!raw) return null;
  try {
    if (/^https?:\/\//iu.test(raw)) return new URL(raw).toString();
    return base && raw.startsWith('/') && !raw.startsWith('//') ? new URL(raw, new URL(base).origin).toString() : null;
  } catch { return null; }
}

function ownedWhere(run: CmsDeliveryRunRow, ctx: TaskRunContext) {
  return and(eq(cmsDeliveryRuns.id, run.id), sql`exists(select 1 from ${cmsDeliveryStates} where ${cmsDeliveryStates.siteId}=${run.siteId} and ${cmsDeliveryStates.latestRunId}=${run.id} and ${cmsDeliveryStates.visibilityEpoch}=${run.visibilityEpoch})`,
    sql`exists(select 1 from ${asyncTasks} where ${asyncTasks.id}=${ctx.taskId} and ${asyncTasks.dispatchToken}=${ctx.dispatchToken} and ${asyncTasks.status}='running' and ${asyncTasks.cancelRequested}=false)`);
}

async function assertCurrent(run: CmsDeliveryRunRow, ctx: TaskRunContext): Promise<void> {
  const [owner] = await db.select({ id: cmsDeliveryRuns.id }).from(cmsDeliveryRuns).where(ownedWhere(run, ctx)).limit(1);
  const identity = await cmsCurrentDeliveryIdentity(db, run.siteId);
  if (!owner || identity.generationId !== run.generationId || identity.activationId !== run.activationId || identity.visibilityEpoch !== run.visibilityEpoch) {
    throw new TaskCancelledError('交付验证身份已过期，未覆盖当前验证记录', { deliveryRunId: run.id });
  }
}

async function record(run: CmsDeliveryRunRow, ctx: TaskRunContext, patch: Partial<typeof cmsDeliveryRuns.$inferInsert>) {
  await assertCurrent(run, ctx);
  const [updated] = await db.update(cmsDeliveryRuns).set(patch).where(ownedWhere(run, ctx)).returning({ id: cmsDeliveryRuns.id });
  if (!updated) throw new TaskCancelledError('交付验证记录已被替代');
}

export async function executeCmsDeliveryCheck(ctx: TaskRunContext) {
  const id = Number(ctx.payload.deliveryRunId);
  const [run] = Number.isSafeInteger(id) && id > 0 ? await db.select().from(cmsDeliveryRuns).where(and(eq(cmsDeliveryRuns.id, id), eq(cmsDeliveryRuns.taskId, ctx.taskId))).limit(1) : [];
  if (!run) throw new TaskCancelledError('交付验证记录不存在');
  await assertCurrent(run, ctx);
  await record(run, ctx, { status: 'cache_refreshing', startedAt: new Date(), completedAt: null, error: null, observations: [] });
  let purgeFailed = false;
  try {
    const site = await resolveEffectiveCmsSiteRow(run.siteId);
    await assertCurrent(run, ctx);
    const purge = await sendCmsCdnPurge(site, run.paths.map(path => path.path), true, `cms-delivery:${run.id}`);
    await record(run, ctx, { purgeStatus: purge.status, purgeHttpStatus: purge.httpStatus, purgeMessage: purge.message });
  } catch (error) {
    if (error instanceof TaskCancelledError) throw error;
    purgeFailed = true;
    await record(run, ctx, { purgeStatus: 'failed', purgeMessage: (error instanceof Error ? error.message : '缓存刷新失败').slice(0, 1000) });
  }
  await record(run, ctx, { status: 'checking' });
  const observations: CmsDeliveryObservation[] = [];
  for (const expectation of run.paths) {
    await assertCurrent(run, ctx);
    const common = { path: expectation.path, expectedGenerationId: run.generationId, expectedReleaseId: run.releaseId, expectedVisibilityEpoch: run.visibilityEpoch, expectedStatus: expectation.expectedStatus };
    const [source, publicResult] = expectation.kind === 'asset' ? await Promise.all([
      probeCmsDeliveryAsset({ target: 'source', path: expectation.path, url: assetUrl(expectation.assetUrl, run.sourceBaseUrl) }, { allowlist: cmsDeliverySourceAllowlist(assetUrl(expectation.assetUrl, run.sourceBaseUrl)) }),
      probeCmsDeliveryAsset({ target: 'public', path: expectation.path, url: assetUrl(expectation.assetUrl, run.publicBaseUrl) }),
    ]) : await Promise.all([
      probeCmsDeliveryTarget({ ...common, target: 'source', baseUrl: run.sourceBaseUrl, sourceHost: run.sourceHost }, { allowlist: cmsDeliverySourceAllowlist(run.sourceBaseUrl) }),
      probeCmsDeliveryTarget({ ...common, target: 'public', baseUrl: run.publicBaseUrl }),
    ]);
    observations.push(source, publicResult);
    await record(run, ctx, { observations: [...observations] });
    await ctx.reportItems([source, publicResult].map(item => ({ key: `${item.target}:${item.path}`, label: `${item.target === 'source' ? '源站' : '公开入口'} ${item.path}`,
      status: item.status === 'passed' ? 'success' as const : item.status === 'unverified' ? 'skipped' as const : 'failed' as const, message: item.message, data: item,
    })));
    const progress = await ctx.progress({ processed: observations.length, total: run.paths.length * 2, note: `已核验 ${observations.length}/${run.paths.length * 2} 个入口路径` });
    if (progress.cancelRequested) throw new TaskCancelledError('交付验证已取消');
  }
  const failed = purgeFailed || observations.some(item => item.status === 'failed');
  const unverified = observations.length === 0 || observations.some(item => item.status === 'unverified');
  const status = failed ? 'failed' : unverified ? 'unverified' : 'passed';
  const error = failed ? purgeFailed ? '缓存刷新请求失败，详见刷新结果及逐路径证据' : '页面状态或交付标记与预期不一致，详见逐路径证据' : null;
  await record(run, ctx, { status, error, completedAt: new Date() });
  if (failed) throw new Error(error!);
  return { deliveryRunId: run.id, status, source: observations.filter(item => item.target === 'source'), public: observations.filter(item => item.target === 'public') };
}

export function registerCmsDeliveryTasks() {
  registerTaskHandler({ taskType: CMS_DELIVERY_TASK, title: 'CMS 交付验证', module: 'CMS内容管理', allowConcurrent: true, maxAttempts: 3, retryDelayMs: 15000,
    run: executeCmsDeliveryCheck,
  });
}
