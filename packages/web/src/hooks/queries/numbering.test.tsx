import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { numberingAllocationContract, numberingBindingContract, numberingRuleContract } from '@zenith/shared/platform';
import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import { ApiRecorder, createRequestMock, createTestQueryClient, createWrapper, hasCacheEntry, observeFetches } from '@/test-utils/query-harness';
import { contractKey, urlOf } from '@/lib/contract-query';

const api = new ApiRecorder();
vi.mock('@/utils/request', () => ({ request: createRequestMock(() => api) }));

import {
  numberingKeys, numberingRuleKeys, useDeleteNumberingRules, useNumberingAllocations, useNumberingBindings,
  useNumberingCounters, useNumberingRuleDetail, useNumberingRuleList, useNumberingRuleOptions, useNumberingScenes,
  useNumberingVersions, usePublishNumberingRule, useSaveNumberingRule, useUpsertNumberingBinding,
} from './numbering';

const rule = SEED_NUMBERING_RULES[0]!;
const version = SEED_NUMBERING_VERSIONS[0]!;
const binding = SEED_NUMBERING_BINDINGS[0]!;
const params = { page: 1, pageSize: 10 };
const listUrl = urlOf(numberingRuleContract.list, { query: params });
const detailUrl = urlOf(numberingRuleContract.detail, { params: { id: rule.id } });

beforeEach(() => {
  api.reset();
  api.on('GET', listUrl, { list: [rule], total: 1, ...params })
    .on('GET', detailUrl, rule)
    .on('GET', urlOf(numberingRuleContract.all, { query: {} }), [{ ...rule, versionId: version.id }])
    .on('GET', urlOf(numberingRuleContract.scenes), [])
    .on('GET', urlOf(numberingRuleContract.versions, { params: { id: rule.id } }), [version])
    .on('GET', urlOf(numberingRuleContract.counters, { params: { id: rule.id } }), [{ scopeKey: 'global', periodKey: '20261011', value: '9007199254740993' }])
    .on('GET', urlOf(numberingBindingContract.list, { query: params }), { list: [binding], total: 1, ...params })
    .on('GET', urlOf(numberingAllocationContract.list, { query: params }), { list: [], total: 0, ...params })
    .on('POST', urlOf(numberingRuleContract.publish, { params: { id: rule.id } }), { ...rule, currentVersion: 2 })
    .on('POST', urlOf(numberingBindingContract.upsert), binding)
    .on('PUT', urlOf(numberingRuleContract.update, { params: { id: rule.id } }), { ...rule, name: '新规则名称' })
    .on('DELETE', urlOf(numberingRuleContract.remove, { params: { id: rule.id } }), null);
});

describe('编号中心缓存一致性', () => {
  it('发布刷新规则、下拉与版本，保留静态场景、固定绑定和分配记录', async () => {
    const qc = createTestQueryClient();
    const hook = renderHook(() => ({
      list: useNumberingRuleList(params), detail: useNumberingRuleDetail(rule.id), options: useNumberingRuleOptions(),
      versions: useNumberingVersions(rule.id), counters: useNumberingCounters(rule.id), scenes: useNumberingScenes(), bindings: useNumberingBindings(params),
      allocations: useNumberingAllocations(params), publish: usePublishNumberingRule(),
    }), { wrapper: createWrapper(qc) });
    await waitFor(() => {
      expect(hook.result.current.list.isSuccess && hook.result.current.detail.isSuccess && hook.result.current.options.isSuccess && hook.result.current.versions.isSuccess).toBe(true);
      expect(hook.result.current.scenes.isSuccess && hook.result.current.bindings.isSuccess && hook.result.current.allocations.isSuccess && hook.result.current.counters.isSuccess).toBe(true);
    });
    const fetches = observeFetches(qc);
    await hook.result.current.publish.mutateAsync({ params: { id: rule.id }, body: { expectedRevision: rule.revision } });
    await waitFor(() => expect(fetches.countOf(numberingKeys.versions(rule.id))).toBe(1));
    expect(fetches.countOf(numberingRuleKeys.lists)).toBe(1);
    expect(fetches.countOf(numberingRuleKeys.detail(rule.id))).toBe(1);
    expect(fetches.countOf(numberingRuleKeys.lookup)).toBe(1);
    expect(fetches.countOf(numberingKeys.scenes)).toBe(0);
    expect(fetches.countOf(numberingKeys.bindings)).toBe(0);
    expect(fetches.countOf(numberingKeys.allocations)).toBe(0);
    expect(fetches.countOf(numberingKeys.counters(rule.id))).toBe(0);
    expect(hook.result.current.counters.data?.[0]?.value).toBe('9007199254740993');
    fetches.stop();
  });

  it('绑定修改仅重拉绑定列表，不刷新规则选择器', async () => {
    const qc = createTestQueryClient();
    const hook = renderHook(() => ({ bindings: useNumberingBindings(params), options: useNumberingRuleOptions(), bind: useUpsertNumberingBinding() }), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(hook.result.current.bindings.isSuccess && hook.result.current.options.isSuccess).toBe(true));
    const fetches = observeFetches(qc);
    await hook.result.current.bind.mutateAsync({ body: { scene: binding.scene, ownerKey: binding.ownerKey, ruleId: rule.id, versionId: version.id, parameterMapping: {} } });
    await waitFor(() => expect(fetches.countOf(numberingKeys.bindings)).toBe(1));
    expect(fetches.countOf(contractKey(numberingRuleContract.all))).toBe(0);
    fetches.stop();
  });

  it('删除移除详情和历史版本缓存，避免重新访问已删除实体', async () => {
    const qc = createTestQueryClient();
    qc.setQueryData(numberingRuleKeys.detail(rule.id), rule);
    qc.setQueryData(numberingKeys.versions(rule.id), [version]);
    qc.setQueryData(numberingKeys.counters(rule.id), []);
    const hook = renderHook(() => useDeleteNumberingRules(), { wrapper: createWrapper(qc) });
    await hook.result.current.mutateAsync([rule.id]);
    expect(hasCacheEntry(qc, numberingRuleKeys.detail(rule.id))).toBe(false);
    expect(hasCacheEntry(qc, numberingKeys.versions(rule.id))).toBe(false);
    expect(hasCacheEntry(qc, numberingKeys.counters(rule.id))).toBe(false);
    expect(api.countOf('GET', detailUrl)).toBe(0);
  });

  it('重命名规则后重新加载绑定列表中的规则名称', async () => {
    const qc = createTestQueryClient();
    const hook = renderHook(() => ({ bindings: useNumberingBindings(params), save: useSaveNumberingRule() }), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(hook.result.current.bindings.isSuccess).toBe(true));
    api.on('GET', urlOf(numberingBindingContract.list, { query: params }), { list: [{ ...binding, ruleName: '新规则名称' }], total: 1, ...params });
    await hook.result.current.save.mutateAsync({ id: rule.id, values: { name: '新规则名称' } });
    await waitFor(() => expect(hook.result.current.bindings.data?.list[0]?.ruleName).toBe('新规则名称'));
  });
});
