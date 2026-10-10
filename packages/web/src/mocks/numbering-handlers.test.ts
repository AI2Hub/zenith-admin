import { beforeEach, describe, expect, it } from 'vitest';
import { numberingBindingContract, numberingRuleContract } from '@zenith/shared/platform';
import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import { urlOf } from '@/lib/contract-query';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from './data/numbering';
import { numberingHandlers } from './handlers/numbering';
import { mockAccessToken } from './utils/auth';

async function call(method: string, url: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${url}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mockAccessToken('admin')}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const handler of numberingHandlers) {
    const response = await handler.run({ request, requestId: 'numbering-contract-test' });
    if (response?.response) return response.response.json();
  }
  throw new Error('Missing numbering handler');
}

beforeEach(() => {
  mockNumberingRules.splice(0, mockNumberingRules.length, ...structuredClone(SEED_NUMBERING_RULES));
  mockNumberingVersions.splice(0, mockNumberingVersions.length, ...structuredClone(SEED_NUMBERING_VERSIONS));
  mockNumberingBindings.splice(0, mockNumberingBindings.length, ...structuredClone(SEED_NUMBERING_BINDINGS));
  mockNumberingAllocations.length = 0; mockNumberingCounters.length = 0;
});

describe('编号中心 Demo 契约行为', () => {
  it('草稿发布后增加版本和修订号，拒绝删除与改变序列策略', async () => {
    const draft = structuredClone(SEED_NUMBERING_RULES[0]!.draft);
    const created = await call('POST', urlOf(numberingRuleContract.create), { code: 'qa.rule', name: '验收规则', scene: 'workflow.instance', draft });
    const id = created.data.id as number;
    const published = await call('POST', urlOf(numberingRuleContract.publish, { params: { id } }), { expectedRevision: 1 });
    expect(published.code).toBe(0);
    expect(published.data.currentVersion).toBe(1);
    expect(published.data.revision).toBe(2);
    const removed = await call('DELETE', urlOf(numberingRuleContract.remove, { params: { id } }));
    expect(removed.code).not.toBe(0);
    const changed = await call('PUT', urlOf(numberingRuleContract.update, { params: { id } }), { expectedRevision: 2, draft: { ...draft, step: '2' } });
    expect(changed.code).toBe(409);
    const renamed = await call('PUT', urlOf(numberingRuleContract.update, { params: { id } }), { expectedRevision: 2, name: '验收规则改名' });
    expect(renamed.code).toBe(0);
    expect(renamed.data.revision).toBe(3);
  });

  it('系统身份不可映射，流程自定义参数必须绑定表单字段', async () => {
    const rule = mockNumberingRules.find(row => row.scene === 'workflow.instance')!;
    const version = mockNumberingVersions.find(row => row.ruleId === rule.id)!;
    const body = { scene: rule.scene, ownerKey: '99', ruleId: rule.id, versionId: version.id, parameterMapping: { departmentId: 'formData.department' } };
    expect((await call('POST', urlOf(numberingBindingContract.upsert), body)).code).toBe(400);
    version.config.template = 'WF-{YYYYMMDD}-{categoryCode}-{SEQ:6}';
    expect((await call('POST', urlOf(numberingBindingContract.upsert), { ...body, parameterMapping: {} })).code).toBe(400);
    expect((await call('POST', urlOf(numberingBindingContract.upsert), { ...body, parameterMapping: { categoryCode: 'formData.category' } })).code).toBe(0);
  });

  it('预览不分配号码，计数接口保留大整数字符串精度', async () => {
    const rule = mockNumberingRules[0]!;
    const response = await call('POST', urlOf(numberingRuleContract.preview), { scene: rule.scene, config: rule.draft, at: '2026-10-11T01:00:00Z' });
    expect(response.data.numbers).toHaveLength(3);
    expect(mockNumberingAllocations).toHaveLength(0);
    expect(mockNumberingCounters).toHaveLength(0);
    mockNumberingCounters.push({ ruleId: rule.id, scopeKey: 'tenant:7/owner:1', periodKey: '20261011', value: '9007199254740993' });
    const counters = await call('GET', urlOf(numberingRuleContract.counters, { params: { id: rule.id } }));
    expect(counters.data).toEqual([{ scopeKey: 'tenant:7/owner:1', periodKey: '20261011', value: '9007199254740993' }]);
  });

  it('平台默认绑定不能删除，管理员仍可调整绑定版本', async () => {
    const binding = mockNumberingBindings[0]!;
    const removed = await call('DELETE', urlOf(numberingBindingContract.remove, { params: { id: binding.id } }));
    expect(removed.code).not.toBe(0);
    const saved = await call('POST', urlOf(numberingBindingContract.upsert), { scene: binding.scene, ownerKey: '*', ruleId: binding.ruleId, versionId: binding.versionId, parameterMapping: {} });
    expect(saved.code).toBe(0);
  });
});
