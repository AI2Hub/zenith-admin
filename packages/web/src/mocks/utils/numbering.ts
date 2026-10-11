import { getNumberingScene, NUMBERING_MAX_SEQUENCE, renderBusinessNumber, resolveNumberingPeriodKey, type NumberingConfig } from '@zenith/shared/platform';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from '@/mocks/data/numbering';
import { MockHttpError } from './contract';
import { badRequest, conflict, nextIdFrom } from './handlers';

export interface MockNumberingRequest {
  scene: string;
  tenantId: number | null;
  ownerKey?: string;
  ruleId?: number;
  ruleVersionId?: number;
}

export interface MockBusinessNumberInput extends MockNumberingRequest {
  allocationKey: string;
  context?: Record<string, string | number>;
  at?: Date;
}

const contextFingerprints = new Map<number, string>();

function resolveVersion(input: MockNumberingRequest) {
  const scene = getNumberingScene(input.scene);
  const ownerKey = input.ownerKey ?? '*';
  const binding = input.ruleId === undefined && input.ruleVersionId === undefined
    ? mockNumberingBindings.filter(row => row.scene === input.scene && (row.ownerKey === ownerKey || row.ownerKey === '*') && (row.tenantId === input.tenantId || row.tenantId === null))
      .sort((a, b) => {
        const rank = (row: typeof a) => (row.tenantId === input.tenantId ? 2 : 0) + (row.ownerKey === ownerKey ? 1 : 0);
        return rank(b) - rank(a);
      })[0]
    : undefined;
  const ruleId = input.ruleId ?? binding?.ruleId;
  const versionId = input.ruleVersionId ?? binding?.versionId;
  const explicitVersion = versionId === undefined ? undefined : mockNumberingVersions.find(version => version.id === versionId);
  const rule = mockNumberingRules.find(row => row.id === (ruleId ?? explicitVersion?.ruleId));
  if (!rule || rule.scene !== input.scene || rule.status !== 'enabled' || (rule.tenantId !== null && rule.tenantId !== input.tenantId) || (!scene.tenantCustomizable && rule.tenantId !== null)) {
    throw new MockHttpError(conflict('编号规则不存在、已停用或不属于当前业务作用域', { status: 409 }));
  }
  const version = explicitVersion ?? (versionId === undefined ? mockNumberingVersions.find(row => row.ruleId === rule.id && row.version === rule.currentVersion) : undefined);
  if (!version || version.ruleId !== rule.id) throw new MockHttpError(conflict('编号规则版本不存在或不匹配', { status: 409 }));
  return { rule, version, binding };
}

export function resolveMockNumberingReference(input: MockNumberingRequest) {
  const { rule, version, binding } = resolveVersion(input);
  return { ruleId: rule.id, versionId: version.id, parameterMapping: { ...binding?.parameterMapping } };
}

function scopeFor(config: NumberingConfig, input: MockNumberingRequest, context: Record<string, string | number>) {
  const tenant = `tenant:${input.tenantId ?? 0}`;
  if (config.scope === 'global') return 'global';
  if (config.scope === 'tenant') return tenant;
  if (config.scope === 'owner') {
    if (!input.ownerKey || input.ownerKey === '*') throw new MockHttpError(badRequest('按业务对象计数需要明确的归属标识', { status: 400 }));
    return `${tenant}/owner:${input.ownerKey}`;
  }
  if (!context.departmentId || !/^\d+$/.test(String(context.departmentId))) throw new MockHttpError(badRequest('按组织计数需要有效的部门标识', { status: 400 }));
  return `${tenant}/department:${context.departmentId}`;
}

/** Synchronous allocation: business handlers validate, allocate, save and attach in one local transaction. */
export function allocateMockBusinessNumber(input: MockBusinessNumberInput): string {
  const scene = getNumberingScene(input.scene);
  const ownerKey = input.ownerKey ?? '*';
  if (scene.uniqueScope === 'owner' && ownerKey === '*') throw new MockHttpError(badRequest('当前业务需要明确的编号归属对象', { status: 400 }));
  if (!input.allocationKey || input.allocationKey.length > 200 || ownerKey.length > 128) throw new MockHttpError(badRequest('编号分配需要有效且稳定的业务操作标识', { status: 400 }));
  const context = { ...input.context, tenantId: String(input.tenantId ?? 0), ownerKey };
  const fingerprint = JSON.stringify(Object.entries(context).sort(([a], [b]) => a.localeCompare(b)));
  const existing = mockNumberingAllocations.find(row => row.scene === input.scene && row.tenantId === input.tenantId && row.ownerKey === ownerKey && row.allocationKey === input.allocationKey);
  if (existing) {
    if (contextFingerprints.get(existing.id) !== fingerprint) throw new MockHttpError(conflict('同一编号分配请求的业务参数发生变化', { status: 409 }));
    return existing.number;
  }
  const { rule, version } = resolveVersion(input);
  const at = input.at ?? new Date();
  const scopeKey = scopeFor(version.config, input, context);
  const periodKey = resolveNumberingPeriodKey(version.config, at);
  const counter = mockNumberingCounters.find(row => row.ruleId === rule.id && row.scopeKey === scopeKey && row.periodKey === periodKey);
  const sequence = counter ? BigInt(counter.value) + BigInt(version.config.step) : BigInt(version.config.start);
  if (sequence > BigInt(NUMBERING_MAX_SEQUENCE)) throw new MockHttpError(conflict('编号流水已达到上限，请配置新的编号序列', { status: 409 }));
  let number: string;
  try { number = renderBusinessNumber(version.config, { sequence, at, context }, scene.code); }
  catch (error) { throw new MockHttpError(badRequest(error instanceof Error ? error.message : '无法生成业务编号', { status: 400 })); }
  const uniqueScope = scene.uniqueScope === 'global' ? 'global' : scene.uniqueScope === 'tenant' ? `tenant:${input.tenantId ?? 0}` : `tenant:${input.tenantId ?? 0}/owner:${ownerKey}`;
  if (mockNumberingAllocations.some(row => row.uniqueNamespace === scene.uniqueNamespace && row.uniqueScope === uniqueScope && row.number === number)) {
    throw new MockHttpError(conflict('编号规则产生了重复号码，请调整规则；本次业务未提交', { status: 409 }));
  }
  const id = nextIdFrom(mockNumberingAllocations);
  // Mutate only after all constraints pass, so failed rendering/collisions never consume a counter.
  if (counter) counter.value = sequence.toString();
  else mockNumberingCounters.push({ ruleId: rule.id, scopeKey, periodKey, value: sequence.toString() });
  mockNumberingAllocations.push({ id, scene: scene.code, tenantId: input.tenantId, ownerKey, allocationKey: input.allocationKey, businessKey: null,
    ruleId: rule.id, versionId: version.id, number, uniqueNamespace: scene.uniqueNamespace, uniqueScope, createdAt: at.toISOString() });
  contextFingerprints.set(id, fingerprint);
  return number;
}

export function attachMockBusinessNumber(input: Pick<MockNumberingRequest, 'scene' | 'tenantId' | 'ownerKey'> & { number: string; businessKey: string }) {
  const allocation = mockNumberingAllocations.find(row => row.scene === input.scene && row.tenantId === input.tenantId && row.ownerKey === (input.ownerKey ?? '*') && row.number === input.number);
  if (!allocation) throw new MockHttpError(conflict('找不到本次业务的编号分配记录', { status: 409 }));
  if (allocation.businessKey !== null && allocation.businessKey !== input.businessKey) throw new MockHttpError(conflict('编号已关联其他业务，不能重新分配', { status: 409 }));
  allocation.businessKey = input.businessKey;
}

/**
 * Demo equivalents of the business transaction. Supply each business store mutated by the callback;
 * on failure its contents and all numbering state are restored without replacing array identities.
 * Do all async work before this callback; yielding midway would allow another handler to interleave.
 */
export function withMockNumberingTransaction<T>(run: () => T, businessStores: readonly unknown[][] = []): T {
  const stores: unknown[][] = [mockNumberingCounters, mockNumberingAllocations, ...businessStores];
  const snapshots = stores.map(store => structuredClone(store));
  const fingerprints = new Map(contextFingerprints);
  try {
    const result = run();
    if (result && typeof result === 'object' && 'then' in result) throw new Error('Mock 编号事务仅支持同步业务操作');
    return result;
  } catch (error) {
    stores.forEach((store, index) => { store.splice(0, store.length, ...snapshots[index]!); });
    contextFingerprints.clear();
    for (const [key, value] of fingerprints) contextFingerprints.set(key, value);
    throw error;
  }
}
