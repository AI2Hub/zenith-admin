import { cmsDeliveryContract, type CmsDeliveryConfig, type CmsDeliveryRun } from '@zenith/shared/cms';
import { mock, MockHttpError } from '../utils/contract';
import { requireItem } from '../utils/crud';
import { conflict, nextIdFrom } from '../utils/handlers';
import { mockDateTime } from '../utils/date';
import { mockCmsSites } from '../data/cms';
import { createProgressingMockTask, getMockActiveAsyncTasks } from './async-tasks';
import { getMockCmsDeploymentRetentionContext, getMockCmsSiteActivations } from './cms-releases';

const configurations = new Map<number, CmsDeliveryConfig>();
const epochs = new Map<number, number>();
const runs: CmsDeliveryRun[] = [];
function configuration(siteId: number): CmsDeliveryConfig {
  requireItem(mockCmsSites, siteId, '站点不存在', { status: 404 });
  return configurations.get(siteId) ?? { siteId, version: 0, sourceBaseUrl: null, publicBaseUrl: null, effectiveSourceBaseUrl: null, paths: ['/'] };
}
function identity(siteId: number) {
  const context = getMockCmsDeploymentRetentionContext(siteId), activation = getMockCmsSiteActivations(siteId).at(-1);
  const release = context.records.find(row => row.deployment.id === context.activeId)?.release;
  return { generationId: context.activeId, releaseId: release?.id ?? null, activationId: activation?.id ?? null, visibilityEpoch: epochs.get(siteId) ?? 0 };
}
function supersede(siteId: number) {
  for (const row of runs) if (row.siteId === siteId && ['activated', 'cache_refreshing', 'checking'].includes(row.status)) {
    row.status = 'superseded'; row.completedAt = mockDateTime(); row.updatedAt = row.completedAt;
  }
}

/** Demo preserves lifecycle and evidence shape, without inventing HTTP or CDN verification results. */
export function queueMockCmsDelivery(siteId: number, cause: CmsDeliveryRun['cause'], visibilityChanged = false): CmsDeliveryRun {
  const config = configuration(siteId);
  if (visibilityChanged) epochs.set(siteId, (epochs.get(siteId) ?? 0) + 1);
  supersede(siteId);
  const now = mockDateTime();
  const row: CmsDeliveryRun = { id: nextIdFrom(runs), siteId, ...identity(siteId), cause, status: 'activated', configVersion: config.version,
    taskId: null, sourceBaseUrl: config.sourceBaseUrl, publicBaseUrl: config.publicBaseUrl, sourceHost: null,
    purgeStatus: 'not_configured', purgeHttpStatus: null, purgeMessage: 'Demo 不调用真实缓存刷新服务',
    paths: config.paths.map(path => ({ path, expectedStatus: 'visible' })), observations: [], error: null,
    startedAt: null, completedAt: null, createdAt: now, updatedAt: now };
  runs.push(row);
  const task = createProgressingMockTask({ taskType: 'cms-delivery-check', title: `CMS 交付检测 #${row.id}`, payload: { siteId, generationId: row.generationId, deliveryRunId: row.id }, totalItems: row.paths.length * 2,
    onSuccess: () => {
      if (row.status === 'superseded') return;
      const current = identity(siteId);
      if (current.generationId !== row.generationId || current.activationId !== row.activationId || current.visibilityEpoch !== row.visibilityEpoch || configuration(siteId).version !== row.configVersion) { row.status = 'superseded'; return; }
      row.status = 'unverified'; row.startedAt = now; row.completedAt = mockDateTime(); row.updatedAt = row.completedAt;
      row.observations = row.paths.flatMap(({ path }) => (['source', 'public'] as const).map(target => ({ target, path, url: null, status: 'unverified' as const,
        httpStatus: null, generationId: null, releaseId: null, visibilityEpoch: null, cacheStatus: null, age: null,
        message: 'Demo 仅展示记录；真实源站、页面和公开入口的检测由服务端执行', checkedAt: row.completedAt! })));
    },
  });
  row.taskId = task.id;
  return row;
}

export const cmsDeliveryHandlers = [
  mock(cmsDeliveryContract.config, ({ query, ok }) => ok(configuration(query.siteId))),
  mock(cmsDeliveryContract.saveConfig, ({ query, body, ok }) => {
    const previous = configuration(query.siteId);
    if (previous.version !== body.expectedVersion) return conflict('入口配置已变化，请刷新后重试', { status: 409 });
    const { expectedVersion, ...values } = body;
    const next = { ...values, siteId: query.siteId, version: expectedVersion + 1, effectiveSourceBaseUrl: values.sourceBaseUrl };
    configurations.set(query.siteId, next); supersede(query.siteId); return ok(next);
  }),
  mock(cmsDeliveryContract.list, ({ query, ok, paginate }) => {
    configuration(query.siteId); getMockActiveAsyncTasks();
    return ok(paginate(runs.filter(row => row.siteId === query.siteId && (!query.releaseId || row.releaseId === query.releaseId)).sort((a, b) => b.id - a.id).map(({ paths: _paths, observations: _observations, ...row }) => row)));
  }),
  mock(cmsDeliveryContract.detail, ({ params, ok }) => { getMockActiveAsyncTasks(); return ok(requireItem(runs, params.id, '交付记录不存在', { status: 404 })); }),
  mock(cmsDeliveryContract.start, ({ body, ok }) => ok(queueMockCmsDelivery(body.siteId, 'manual'))),
  mock(cmsDeliveryContract.retry, ({ params, ok }) => {
    const row = requireItem(runs, params.id, '交付记录不存在', { status: 404 }), current = identity(row.siteId);
    if (row.generationId !== current.generationId || row.activationId !== current.activationId || row.visibilityEpoch !== current.visibilityEpoch) throw new MockHttpError(conflict('此记录已不属于当前公开版本，请检测当前版本', { status: 409 }));
    return ok(queueMockCmsDelivery(row.siteId, 'manual'));
  }),
];
