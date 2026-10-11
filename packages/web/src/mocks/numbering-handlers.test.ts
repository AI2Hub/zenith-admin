import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NUMBERING_SCENES, numberingDefaultContract, numberingRuleContract } from '@zenith/shared/platform';
import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import { urlOf } from '@/lib/contract-query';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from './data/numbering';
import { numberingHandlers } from './handlers/numbering';
import { mockAccessToken } from './utils/auth';
import { mockWorkflowDefinitions, mockWorkflowInstances } from './data/workflow';
import { mockUsers, normalUserRole } from './data/users';
import { mockTenants } from './data/tenants';
import { numberMockWorkflowInstance, pinMockWorkflowNumbering } from './utils/workflow-numbering';

const workflowStores = [mockWorkflowDefinitions, mockWorkflowInstances, mockUsers];
const workflowSnapshots = workflowStores.map(store => structuredClone(store));
afterEach(() => { workflowStores.forEach((store, index) => (store as unknown[]).splice(0, store.length, ...structuredClone(workflowSnapshots[index]!))); });

async function call(method: string, url: string, body?: unknown, token = mockAccessToken('admin')) {
  const request = new Request(`${window.location.origin}${url}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const handler of numberingHandlers) {
    const response = await handler.run({ request, requestId: crypto.randomUUID() });
    if (response?.response) return { ...await response.response.json(), status: response.response.status };
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
  it('轻量规则选项返回已发布模板及自定义参数，不泄漏未发布草稿配置', async () => {
    const rule = mockNumberingRules.find(row => row.scene === 'workflow.instance')!;
    const version = mockNumberingVersions.find(row => row.ruleId === rule.id)!;
    version.config.template = 'WF-{YYYYMMDD}-{departmentId}-{categoryCode}-{SEQ:6}';
    rule.draft.template = 'DRAFT-{YYYYMMDD}-{SEQ:6}';
    const result = await call('GET', urlOf(numberingRuleContract.all, { query: { scene: 'workflow.instance' } }));
    expect(result.data.find((option: { id: number }) => option.id === rule.id)).toMatchObject({
      template: version.config.template, requiredParameters: ['categoryCode'], versionId: version.id,
    });
    expect(JSON.stringify(result.data)).not.toContain('DRAFT-');
  });

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

  it('FORM参数由统一helper提取，默认规则不要求人工参数映射，流程发布固定实际字段', async () => {
    const rule = mockNumberingRules.find(item => item.scene === 'workflow.instance')!;
    const version = mockNumberingVersions.find(item => item.ruleId === rule.id)!;
    version.config.template = '{DEPT_CODE}-{FORM.地区}-{SEQ:2}-{FORM.category}-{YYMMDD}';
    const options = await call('GET', urlOf(numberingRuleContract.all, { query: { scene: rule.scene } }));
    expect(options.data.find((item: { id: number }) => item.id === rule.id).requiredParameters).toEqual(['FORM.地区', 'FORM.category']);
    const body = { ruleId: rule.id, versionId: version.id, expectedVersionId: version.id };
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params: { scene: rule.scene } }), body)).code).toBe(0);
    const definition = { ...structuredClone(mockWorkflowDefinitions[0]!), id: 99, tenantId: null, formId: null, formType: 'external' as const,
      customForm: { createComponent: '', viewComponent: 'biz/TestForm', variables: [
        { key: 'regionCode', label: '地区', type: 'string' as const }, { key: 'category', label: '分类', type: 'string' as const },
      ] } };
    delete definition.flowData!.settings!.numbering;
    const published = pinMockWorkflowNumbering(definition);
    expect(published.settings!.numbering!.parameterMapping).toEqual({ 'FORM.地区': 'formData.regionCode', 'FORM.category': 'formData.category' });
    expect(mockNumberingBindings.find(binding => binding.ownerKey === '99')).toBeUndefined();
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

  it('默认设置固定返回全部业务，平台只能改选不能恢复删除', async () => {
    const result = await call('GET', urlOf(numberingDefaultContract.list));
    expect(result.data.map((item: { scene: string }) => item.scene)).toEqual(NUMBERING_SCENES.map(scene => scene.code));
    expect(result.data).toHaveLength(14);
    const defaults = result.data[0];
    expect(defaults).toMatchObject({ sourceTenantName: '平台', inherited: false, canUpdate: true, canReset: false });
    const reset = await call('DELETE', urlOf(numberingDefaultContract.reset, { params: { scene: defaults.scene } }), { expectedVersionId: defaults.expectedVersionId });
    expect(reset.status).toBe(409);
    expect(mockNumberingBindings).toHaveLength(14);
    expect((await call('GET', urlOf(numberingDefaultContract.list), undefined, 'invalid')).status).toBe(401);
  });
  it('租户覆盖使用乐观版本，恢复仅移除自己的默认行，支付始终继承平台规则', async () => {
    const tenantId = mockTenants[0]!.id;
    const token = mockAccessToken('admin', tenantId);
    const rule = mockNumberingRules.find(item => item.scene === 'workflow.instance')!;
    const oldVersion = mockNumberingVersions.find(item => item.ruleId === rule.id)!;
    const version = { ...structuredClone(oldVersion), id: 901, version: 2 };
    mockNumberingVersions.push(version);
    const params = { scene: rule.scene };
    const initial = await call('GET', urlOf(numberingDefaultContract.list), undefined, token);
    expect(initial.data.find((item: { scene: string }) => item.scene === rule.scene)).toMatchObject({ inherited: true, expectedVersionId: null, sourceTenantId: null, canReset: false });
    const updated = await call('PUT', urlOf(numberingDefaultContract.update, { params }), { ruleId: rule.id, versionId: version.id, expectedVersionId: null }, token);
    expect(updated.data).toMatchObject({ inherited: false, sourceTenantId: tenantId, versionId: 901, version: 2, expectedVersionId: 901, canReset: true });
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params }), { ruleId: rule.id, versionId: oldVersion.id, expectedVersionId: null }, token)).status).toBe(409);
    expect((await call('DELETE', urlOf(numberingDefaultContract.reset, { params }), { expectedVersionId: oldVersion.id }, token)).status).toBe(409);
    const otherTenantId = tenantId + 100;
    const platformBinding = mockNumberingBindings.find(binding => binding.scene === rule.scene && binding.tenantId === null)!;
    mockNumberingBindings.push({ ...structuredClone(platformBinding), id: 902, tenantId: otherTenantId });
    const restored = await call('DELETE', urlOf(numberingDefaultContract.reset, { params }), { expectedVersionId: 901 }, token);
    expect(restored.data).toMatchObject({ inherited: true, sourceTenantId: null, versionId: oldVersion.id, expectedVersionId: null });
    expect(mockNumberingBindings.some(binding => binding.scene === rule.scene && binding.tenantId === otherTenantId)).toBe(true);
    const paymentBinding = mockNumberingBindings.find(binding => binding.scene === 'payment.order' && binding.tenantId === null)!;
    mockNumberingBindings.push({ ...structuredClone(paymentBinding), id: 903, tenantId, versionId: 999 });
    const paymentList = await call('GET', urlOf(numberingDefaultContract.list), undefined, token);
    expect(paymentList.data.find((item: { scene: string }) => item.scene === 'payment.order')).toMatchObject({ versionId: paymentBinding.versionId, inherited: true, expectedVersionId: null, canUpdate: false, canReset: false });
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params: { scene: 'payment.order' } }), { ruleId: paymentBinding.ruleId, versionId: paymentBinding.versionId, expectedVersionId: null }, token)).status).toBe(403);
  });

  it('改选校验真实业务、版本归属、状态和租户范围，拒绝普通管理员修改平台默认', async () => {
    const rule = mockNumberingRules.find(item => item.scene === 'workflow.instance')!;
    const version = mockNumberingVersions.find(item => item.ruleId === rule.id)!;
    const params = { scene: rule.scene };
    const payment = mockNumberingRules.find(item => item.scene === 'payment.order')!;
    const current = { ruleId: rule.id, versionId: version.id, expectedVersionId: version.id };
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params }), { ...current, ruleId: payment.id, versionId: payment.id })).status).toBe(400);
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params }), { ...current, versionId: payment.id })).status).toBe(400);
    rule.status = 'disabled';
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params }), current)).status).toBe(400);
    rule.status = 'enabled';
    const foreign = { ...structuredClone(rule), id: 911, code: 'foreign.rule', tenantId: mockTenants[0]!.id + 100 };
    mockNumberingRules.push(foreign);
    mockNumberingVersions.push({ ...structuredClone(version), id: 912, ruleId: foreign.id });
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params }), { ruleId: foreign.id, versionId: 912, expectedVersionId: null }, mockAccessToken('admin', mockTenants[0]!.id))).status).toBe(400);
    mockUsers.push({ ...structuredClone(mockUsers[0]!), id: 913, username: 'ordinary', roles: [normalUserRole] });
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params }), current, mockAccessToken('ordinary'))).status).toBe(403);
  });

  it('规则使用位置来自真实默认及已发布流程快照，隐藏draft和其它租户且正确显示历史版本', async () => {
    const rule = mockNumberingRules.find(item => item.scene === 'workflow.instance')!;
    const oldVersion = mockNumberingVersions.find(item => item.ruleId === rule.id)!;
    const historical = { ...structuredClone(oldVersion), id: 921, version: 2 };
    mockNumberingVersions.push(historical);
    for (const definition of mockWorkflowDefinitions) definition.status = 'draft';
    const tenantId = mockTenants[0]!.id;
    const template = structuredClone(mockWorkflowDefinitions[0]!);
    const withRef = (id: number, name: string, status: typeof template.status, ownerTenant: number | null) => ({ ...structuredClone(template), id, name, status, tenantId: ownerTenant,
      flowData: { ...structuredClone(template.flowData!), settings: { allowWithdraw: true, allowResubmit: true, notifyInitiator: true, ...template.flowData!.settings, numbering: { ruleId: rule.id, versionId: historical.id, parameterMapping: {} } } } });
    mockWorkflowDefinitions.push(withRef(922, '已发布流程', 'published', tenantId), withRef(923, '停用流程', 'disabled', tenantId), withRef(924, '未发布流程', 'draft', tenantId), withRef(925, '其它租户流程', 'published', tenantId + 100));
    // A stale internal owner binding must not be presented as a user-editable usage.
    mockNumberingBindings.push({ ...structuredClone(mockNumberingBindings[0]!), id: 926, ownerKey: '924', tenantId });
    const usages = await call('GET', urlOf(numberingRuleContract.usages, { params: { id: rule.id } }), undefined, mockAccessToken('admin', tenantId));
    expect(usages.data.filter((item: { kind: string }) => item.kind === 'workflow').map((item: { name: string }) => item.name)).toEqual(['已发布流程', '停用流程']);
    expect(usages.data.find((item: { name: string }) => item.name === '已发布流程')).toMatchObject({ versionId: 921, version: 2, objectKey: '922', destination: '/workflow/designer/922' });
    expect(usages.data.filter((item: { kind: string }) => item.kind === 'default')).toHaveLength(1);
    expect(usages.data.some((item: { objectKey: string }) => item.objectKey === '924')).toBe(false);
    const all = await call('GET', urlOf(numberingRuleContract.usages, { params: { id: rule.id } }));
    expect(all.data.some((item: { name: string }) => item.name === '其它租户流程')).toBe(true);
  });

  it('清空流程专用选择后重新发布采用当前默认，已运行实例继续使用原编号版本', async () => {
    const rule = mockNumberingRules.find(item => item.scene === 'workflow.instance')!;
    const oldVersion = mockNumberingVersions.find(item => item.ruleId === rule.id)!;
    const definition = { ...structuredClone(mockWorkflowDefinitions[0]!), id: 931, tenantId: null, formId: null, formType: 'external' as const,
      customForm: { createComponent: '', variables: [] } };
    definition.flowData!.settings!.numbering = { ruleId: rule.id, versionId: oldVersion.id, parameterMapping: {} };
    const staleBinding = { ...structuredClone(mockNumberingBindings[0]!), id: 930, ownerKey: String(definition.id), ruleId: rule.id, versionId: oldVersion.id };
    mockNumberingBindings.push(staleBinding);
    definition.flowData = pinMockWorkflowNumbering(definition);
    const instance = { ...structuredClone(mockWorkflowInstances[0]!), id: 932, definitionId: definition.id, tenantId: null, initiatorId: 1, serialNo: null,
      definitionSnapshot: structuredClone(definition), formSnapshot: { formType: 'external' as const, fields: [], customForm: definition.customForm }, formData: {} };
    numberMockWorkflowInstance(instance);
    const originalNumber = instance.serialNo;
    const newRule = { ...structuredClone(rule), id: 933, code: 'new.default.rule', name: '新默认规则', draft: { ...rule.draft, template: 'NEW{YYYYMMDD}{SEQ:6}' } };
    const newVersion = { ...structuredClone(oldVersion), id: 934, ruleId: newRule.id, config: structuredClone(newRule.draft) };
    mockNumberingRules.push(newRule); mockNumberingVersions.push(newVersion);
    expect((await call('PUT', urlOf(numberingDefaultContract.update, { params: { scene: rule.scene } }), { ruleId: newRule.id, versionId: newVersion.id, expectedVersionId: oldVersion.id })).code).toBe(0);
    delete definition.flowData!.settings!.numbering;
    definition.flowData = pinMockWorkflowNumbering(definition);
    expect(definition.flowData.settings!.numbering).toMatchObject({ ruleId: 933, versionId: 934 });
    expect(mockNumberingBindings.find(binding => binding.ownerKey === String(definition.id))).toMatchObject({ ruleId: rule.id, versionId: oldVersion.id });
    numberMockWorkflowInstance(instance);
    expect(instance.serialNo).toBe(originalNumber);
    expect(instance.definitionSnapshot.flowData!.settings!.numbering).toMatchObject({ ruleId: rule.id, versionId: oldVersion.id });
    expect(mockNumberingAllocations.find(allocation => allocation.number === originalNumber)).toMatchObject({ ruleId: rule.id, versionId: oldVersion.id });
    const nextInstance = { ...structuredClone(instance), id: 935, serialNo: null, definitionSnapshot: structuredClone(definition) };
    numberMockWorkflowInstance(nextInstance);
    expect(nextInstance.serialNo).toMatch(/^NEW/);
    expect(mockNumberingAllocations.find(allocation => allocation.number === nextInstance.serialNo)).toMatchObject({ ruleId: 933, versionId: 934 });
  });
  it.each(['definition', 'draft'] as const)('删除全部绑定后，仍保护 %s 的固定编号引用', async source => {
    const rule = mockNumberingRules.find(item => item.scene === 'workflow.instance')!;
    mockNumberingBindings.splice(0, mockNumberingBindings.length, ...mockNumberingBindings.filter(item => item.ruleId !== rule.id));
    for (const definition of mockWorkflowDefinitions) definition.status = 'draft';
    for (const instance of mockWorkflowInstances) instance.status = 'approved';
    if (source === 'definition') mockWorkflowDefinitions[0]!.status = 'disabled';
    else {
      const instance = mockWorkflowInstances[0]!;
      instance.status = 'draft'; instance.serialNo = null;
      instance.definitionSnapshot = structuredClone(mockWorkflowDefinitions[0]!);
    }
    const response = await call('PUT', urlOf(numberingRuleContract.update, { params: { id: rule.id } }), { status: 'disabled', expectedRevision: rule.revision });
    expect(response.code).toBe(409); expect(rule.status).toBe('enabled');
  });
});
