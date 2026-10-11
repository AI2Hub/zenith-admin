import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { numberingAllocationContract, numberingDefaultContract, numberingRuleContract, type NumberingDefault } from '@zenith/shared/platform';
import { SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper, hasCacheEntry, observeFetches } from '@/test-utils/query-harness';
import { contractKey, urlOf } from '@/lib/contract-query';

const api = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => api) }));

import { numberingKeys, numberingRuleKeys, useDeleteNumberingRules, useNumberingAllocations, useNumberingDefaults,
  useNumberingCounters, useNumberingRuleDetail, useNumberingRuleList, useNumberingRuleOptions, useNumberingRuleUsages, useNumberingScenes,
  useNumberingVersions, usePublishNumberingRule, useSaveNumberingRule, useUpdateNumberingDefault, useResetNumberingDefault } from './numbering';

const rule = SEED_NUMBERING_RULES[0]!;
const version = SEED_NUMBERING_VERSIONS[0]!;
const defaultRule: NumberingDefault = { scene: rule.scene, businessName: '流程实例', description: '', tenantCustomizable: true,
  tenantId: 1, sourceTenantId: null, sourceTenantName: null, inherited: true, ruleId: rule.id, ruleName: rule.name,
  versionId: version.id, version: version.version, template: version.config.template, scope: version.config.scope,
  expectedVersionId: null, canUpdate: true, canReset: false };
const params = { page: 1, pageSize: 10 };
const listUrl = urlOf(numberingRuleContract.list, { query: params });
const detailUrl = urlOf(numberingRuleContract.detail, { params: { id: rule.id } });
const usageUrl = urlOf(numberingRuleContract.usages, { params: { id: rule.id } });

beforeEach(() => {
  api.reset();
  api.on('GET', listUrl, { list: [rule], total: 1, ...params })
    .on('GET', detailUrl, rule)
    .on('GET', urlOf(numberingRuleContract.all, { query: {} }), [{ ...rule, versionId: version.id }])
    .on('GET', urlOf(numberingRuleContract.scenes), [])
    .on('GET', urlOf(numberingRuleContract.versions, { params: { id: rule.id } }), [version])
    .on('GET', urlOf(numberingRuleContract.counters, { params: { id: rule.id } }), [{ scopeKey: 'global', periodKey: '20261011', value: '9007199254740993' }])
    .on('GET', usageUrl, [])
    .on('GET', '/api/numbering-rules/999/usages', [])
    .on('GET', urlOf(numberingDefaultContract.list), [defaultRule])
    .on('GET', urlOf(numberingAllocationContract.list, { query: params }), { list: [], total: 0, ...params })
    .on('POST', urlOf(numberingRuleContract.publish, { params: { id: rule.id } }), { ...rule, currentVersion: 2 })
    .on('PUT', urlOf(numberingDefaultContract.update, { params: { scene: rule.scene } }), { ...defaultRule, inherited: false, canReset: true, expectedVersionId: version.id })
    .on('DELETE', urlOf(numberingDefaultContract.reset, { params: { scene: rule.scene } }), defaultRule)
    .on('PUT', urlOf(numberingRuleContract.update, { params: { id: rule.id } }), { ...rule, name: '新规则名称' })
    .on('DELETE', urlOf(numberingRuleContract.remove, { params: { id: rule.id } }), null);
});

describe('编号中心缓存一致性', () => {
  it('发布刷新规则、下拉与版本，保留默认规则和流程使用的固定版本', async () => {
    const qc = createTestQueryClient();
    const hook = renderHook(() => ({ list: useNumberingRuleList(params), detail: useNumberingRuleDetail(rule.id), options: useNumberingRuleOptions(),
      versions: useNumberingVersions(rule.id), counters: useNumberingCounters(rule.id), scenes: useNumberingScenes(), defaults: useNumberingDefaults(),
      usages: useNumberingRuleUsages(rule.id), allocations: useNumberingAllocations(params), publish: usePublishNumberingRule(),
    }), { wrapper: createWrapper(qc) });
    await waitFor(() => {
      expect(hook.result.current.list.isSuccess && hook.result.current.detail.isSuccess && hook.result.current.options.isSuccess && hook.result.current.versions.isSuccess).toBe(true);
      expect(hook.result.current.scenes.isSuccess && hook.result.current.defaults.isSuccess && hook.result.current.usages.isSuccess && hook.result.current.allocations.isSuccess && hook.result.current.counters.isSuccess).toBe(true);
    });
    const fetches = observeFetches(qc);
    await hook.result.current.publish.mutateAsync({ params: { id: rule.id }, body: { expectedRevision: rule.revision } });
    await waitFor(() => expect(fetches.countOf(numberingKeys.versions(rule.id))).toBe(1));
    expect(fetches.countOf(numberingRuleKeys.lists)).toBe(1);
    expect(fetches.countOf(numberingRuleKeys.detail(rule.id))).toBe(1);
    expect(fetches.countOf(numberingRuleKeys.lookup)).toBe(1);
    for (const key of [numberingKeys.scenes, numberingKeys.defaults, numberingKeys.usages(rule.id), numberingKeys.allocations, numberingKeys.counters(rule.id)]) expect(fetches.countOf(key)).toBe(0);
    expect(hook.result.current.defaults.data?.[0]?.versionId).toBe(version.id);
    expect(hook.result.current.counters.data?.[0]?.value).toBe('9007199254740993');
    fetches.stop();
  });

  it.each(['update', 'reset'] as const)('默认%s后重拉默认清单和新旧规则使用位置，保留规则内容与生成记录', async action => {
    const qc = createTestQueryClient();
    const hook = renderHook(() => ({ defaults: useNumberingDefaults(), oldUsage: useNumberingRuleUsages(rule.id), newUsage: useNumberingRuleUsages(999),
      options: useNumberingRuleOptions(), versions: useNumberingVersions(rule.id), counters: useNumberingCounters(rule.id), allocations: useNumberingAllocations(params),
      update: useUpdateNumberingDefault(), reset: useResetNumberingDefault(),
    }), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(hook.result.current.defaults.isSuccess && hook.result.current.oldUsage.isSuccess && hook.result.current.newUsage.isSuccess
      && hook.result.current.options.isSuccess && hook.result.current.versions.isSuccess && hook.result.current.counters.isSuccess && hook.result.current.allocations.isSuccess).toBe(true));
    const fetches = observeFetches(qc);
    if (action === 'update') await hook.result.current.update.mutateAsync({ params: { scene: rule.scene }, body: { ruleId: rule.id, versionId: version.id, expectedVersionId: null } });
    else await hook.result.current.reset.mutateAsync({ params: { scene: rule.scene }, body: { expectedVersionId: version.id } });
    await waitFor(() => {
      expect(fetches.countOf(numberingKeys.defaults)).toBe(1);
      expect(fetches.countOf(numberingKeys.usages(rule.id))).toBe(1);
      expect(fetches.countOf(numberingKeys.usages(999))).toBe(1);
    });
    for (const key of [contractKey(numberingRuleContract.all), numberingKeys.versions(rule.id), numberingKeys.counters(rule.id), numberingKeys.allocations]) expect(fetches.countOf(key)).toBe(0);
    expect(api.calls.find(call => call.method === (action === 'update' ? 'PUT' : 'DELETE'))?.body).toMatchObject({ expectedVersionId: action === 'update' ? null : version.id });
    fetches.stop();
  });

  it('删除移除详情、版本和使用位置缓存，并刷新默认清单', async () => {
    const qc = createTestQueryClient();
    qc.setQueryData(numberingRuleKeys.detail(rule.id), rule);
    qc.setQueryData(numberingKeys.versions(rule.id), [version]);
    qc.setQueryData(numberingKeys.counters(rule.id), []);
    qc.setQueryData(numberingKeys.usages(rule.id), []);
    const hook = renderHook(() => ({ remove: useDeleteNumberingRules(), defaults: useNumberingDefaults() }), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(hook.result.current.defaults.isSuccess).toBe(true));
    await hook.result.current.remove.mutateAsync([rule.id]);
    for (const key of [numberingRuleKeys.detail(rule.id), numberingKeys.versions(rule.id), numberingKeys.counters(rule.id), numberingKeys.usages(rule.id)]) expect(hasCacheEntry(qc, key)).toBe(false);
    await waitFor(() => expect(api.countOf('GET', urlOf(numberingDefaultContract.list))).toBe(2));
    expect(api.countOf('GET', detailUrl)).toBe(0);
  });

  it('重命名规则后更新默认规则名称和使用位置快照', async () => {
    const qc = createTestQueryClient();
    const hook = renderHook(() => ({ defaults: useNumberingDefaults(), usages: useNumberingRuleUsages(rule.id), save: useSaveNumberingRule() }), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(hook.result.current.defaults.isSuccess && hook.result.current.usages.isSuccess).toBe(true));
    api.on('GET', urlOf(numberingDefaultContract.list), [{ ...defaultRule, ruleName: '新规则名称' }]);
    const fetches = observeFetches(qc);
    await hook.result.current.save.mutateAsync({ id: rule.id, values: { name: '新规则名称' } });
    await waitFor(() => expect(hook.result.current.defaults.data?.[0]?.ruleName).toBe('新规则名称'));
    expect(fetches.countOf(numberingKeys.usages(rule.id))).toBe(1);
    fetches.stop();
  });
});
