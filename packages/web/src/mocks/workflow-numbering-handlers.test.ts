import { afterEach, describe, expect, it } from 'vitest';
import type { AnyOperation } from '@zenith/shared/core';
import { workflowDefinitionContract, workflowInstanceContract } from '@zenith/shared/workflow';
import { mockWorkflowDefinitions, mockWorkflowDefinitionVersions, mockWorkflowInstances, mockWorkflowTasks } from './data/workflow';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingVersions } from './data/numbering';
import { mockWorkflowForms } from './data/workflow-forms';
import { workflowHandlers } from './handlers/workflow';
import { workflowExtraHandlers } from './handlers/workflow-extra';
import { mockAccessToken } from './utils/auth';

const stores = [mockWorkflowDefinitions, mockWorkflowDefinitionVersions, mockWorkflowForms, mockWorkflowInstances, mockWorkflowTasks, mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingVersions];
const snapshots = stores.map(store => structuredClone(store));
afterEach(() => { stores.forEach((store, i) => { (store as unknown[]).splice(0, store.length, ...structuredClone(snapshots[i]!)); }); });
async function call(operation: AnyOperation, body: unknown = {}, params: Record<string, number> = {}) {
  let path = operation.fullPath;
  for (const [key, value] of Object.entries(params)) path = path.replace(`{${key}}`, String(value));
  for (const handler of [...workflowExtraHandlers, ...workflowHandlers]) {
    const request = new Request(new URL(path, window.location.origin), { method: operation.method.toUpperCase(),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${mockAccessToken('admin')}` },
      body: operation.method === 'get' ? undefined : JSON.stringify(body) });
    const result = await (handler as unknown as { run: (args: unknown) => Promise<{ response?: Response } | null> }).run({ request, requestId: crypto.randomUUID() });
    if (result?.response) return { status: result.response.status, body: await result.response.json() };
  }
  throw new Error('No handler');
}

describe('workflow numbering through Demo APIs', () => {
  it('does not allocate for drafts, allocates on submit and keeps the number after returning', async () => {
    const allocationCount = mockNumberingAllocations.length;
    const created = await call(workflowInstanceContract.create, { definitionId: 2, title: '编号草稿', asDraft: true, formData: { amount: 200 } });
    expect(created.status).toBe(200);
    const instance = mockWorkflowInstances.find(item => item.id === created.body.data.id)!;
    expect(instance.serialNo).toBeNull(); expect(mockNumberingAllocations).toHaveLength(allocationCount);
    expect((await call(workflowInstanceContract.submitDraft, {}, { id: instance.id })).status).toBe(200);
    const number = instance.serialNo;
    expect(number).toBeTruthy(); expect(mockNumberingAllocations).toHaveLength(allocationCount + 1);
    expect(mockNumberingAllocations.at(-1)?.businessKey).toBe(String(instance.id));
    instance.status = 'returned';
    expect((await call(workflowInstanceContract.submitDraft, {}, { id: instance.id })).status).toBe(200);
    expect(instance.serialNo).toBe(number); expect(mockNumberingAllocations).toHaveLength(allocationCount + 1);
  });
  it('rejects a published definition without a frozen reference without leaving an instance or consuming a number', async () => {
    const definition = mockWorkflowDefinitions[0]!;
    delete definition.flowData!.settings!.numbering;
    const count = mockWorkflowInstances.length;
    const allocationCount = mockNumberingAllocations.length;
    const response = await call(workflowInstanceContract.create, { definitionId: definition.id, title: '缺少固定规则', formData: { days: 1 } });
    expect(response.status).toBe(409); expect(response.body.code).toBe(409);
    expect(mockWorkflowInstances).toHaveLength(count); expect(mockNumberingAllocations).toHaveLength(allocationCount);
  });
  it('pins the default on publish and allocations keep the pinned version when newer versions appear', async () => {
    const definition = mockWorkflowDefinitions[1]!;
    delete definition.flowData!.settings!.numbering;
    expect((await call(workflowDefinitionContract.publish, {}, { id: definition.id })).status).toBe(200);
    const published = mockWorkflowDefinitions.find(item => item.id === definition.id)!;
    const ref = published.flowData!.settings!.numbering!;
    const version = mockNumberingVersions.find(item => item.id === ref.versionId)!;
    mockNumberingVersions.push({ ...version, id: 9000, version: version.version + 1, config: { ...version.config, template: 'NEW-{YYYYMMDD}-{SEQ}' } });
    const result = await call(workflowInstanceContract.create, { definitionId: definition.id, title: '固定旧版本', formData: { amount: 100 } });
    expect(result.status).toBe(200); expect(mockNumberingAllocations.at(-1)?.versionId).toBe(ref.versionId); expect(result.body.data.serialNo).not.toMatch(/^NEW-/);
  });
  it('keeps the original numbering reference when reading and resubmitting an existing numbered instance', async () => {
    const created = await call(workflowInstanceContract.create, { definitionId: 2, title: '保留编号引用', formData: { amount: 100 } });
    expect(created.status).toBe(200);
    const instance = mockWorkflowInstances.find(item => item.id === created.body.data.id)!;
    const originalReference = structuredClone(instance.definitionSnapshot!.flowData!.settings!.numbering);
    const originalNumber = instance.serialNo;
    const allocationCount = mockNumberingAllocations.length;
    const definition = mockWorkflowDefinitions.find(item => item.id === 2)!;
    definition.flowData!.settings!.numbering = { ...originalReference!, versionId: 9000 };
    const viewed = await call(workflowInstanceContract.detail, {}, { id: instance.id });
    expect(viewed.status).toBe(200);
    expect(viewed.body.data.definitionSnapshot.flowData.settings.numbering).toEqual(originalReference);
    instance.status = 'returned';
    const resubmitted = await call(workflowInstanceContract.submitDraft, {}, { id: instance.id });
    expect(resubmitted.status).toBe(200);
    expect(instance.serialNo).toBe(originalNumber);
    expect(instance.definitionSnapshot!.flowData!.settings!.numbering).toEqual(originalReference);
    expect(mockNumberingAllocations).toHaveLength(allocationCount);
  });
  it('publishing freezes the concrete workflow reference, while enabling preserves its mapping', async () => {
    const definition = mockWorkflowDefinitions.find(item => item.id === 2)!;
    const version = mockNumberingVersions.find(item => item.id === definition.flowData!.settings!.numbering!.versionId)!;
    version.config.template = 'WF{YYYYMMDD}-{categoryCode}-{SEQ}';
    definition.flowData!.settings!.numbering!.parameterMapping = { categoryCode: 'formData.expenseType' };
    const published = await call(workflowDefinitionContract.publish, {}, { id: definition.id });
    expect(published.status).toBe(200); expect(published.body.code).toBe(0);
    const reference = published.body.data.flowData.settings.numbering;
    expect(reference).toMatchObject({ ruleId: definition.flowData!.settings!.numbering!.ruleId, versionId: definition.flowData!.settings!.numbering!.versionId });
    expect(mockNumberingBindings.filter(item => item.scene === 'workflow.instance' && item.ownerKey === '2')).toHaveLength(0);
    await call(workflowDefinitionContract.disable, {}, { id: 2 });
    const form = mockWorkflowForms.find(item => item.id === definition.formId)!;
    form.schema!.fields = [];
    definition.flowData!.settings!.numbering!.parameterMapping = {};
    const enabled = await call(workflowDefinitionContract.enable, {}, { id: 2 });
    expect(enabled.status).toBe(200); expect(enabled.body.code).toBe(0);
    expect(definition.flowData!.settings!.numbering!.parameterMapping).toEqual({});
    await call(workflowDefinitionContract.disable, {}, { id: 2 });
    const disabled = mockWorkflowDefinitions.find(item => item.id === 2)!;
    disabled.flowData!.settings!.numbering!.parameterMapping.categoryCode = 'formData.changed';
    const invalid = await call(workflowDefinitionContract.enable, {}, { id: 2 });
    expect(invalid.status).toBe(409); expect(invalid.body.code).toBe(409);
    expect(disabled.status).toBe('disabled');
  });
  it('does not save an unpinned draft or consume a number', async () => {
    delete mockWorkflowDefinitions[0]!.flowData!.settings!.numbering;
    const count = mockWorkflowInstances.length;
    const allocations = mockNumberingAllocations.length;
    const response = await call(workflowInstanceContract.create, { definitionId: 1, title: '无固定引用草稿', asDraft: true });
    expect(response.status).toBe(409); expect(response.body.code).toBe(409);
    expect(mockWorkflowInstances).toHaveLength(count); expect(mockNumberingAllocations).toHaveLength(allocations);
  });
  it('publishes multiple FORM labels, then allocates with fixed keys, legacy aliases, inline widths and a zero start', async () => {
    const definition = mockWorkflowDefinitions.find(item => item.id === 2)!;
    const reference = definition.flowData!.settings!.numbering!;
    const version = mockNumberingVersions.find(item => item.id === reference.versionId)!;
    version.config = { ...version.config, template: '{USER}-{FORM.费用类型}-{SEQ:2}-{FORM.报销金额}-{YYMMDD}', start: '0' };
    const form = mockWorkflowForms.find(item => item.id === definition.formId)!;
    const expenseType = form.schema!.fields.find(field => field.key === 'expenseType')!;
    const amount = form.schema!.fields.find(field => field.key === 'amount')!;
    expenseType.label = '费用类型'; amount.label = '报销金额';
    const published = await call(workflowDefinitionContract.publish, {}, { id: 2 });
    expect(published.status).toBe(200); expect(published.body.code).toBe(0);
    expect(published.body.data.flowData.settings.numbering.parameterMapping).toEqual({
      'FORM.费用类型': 'formData.expenseType', 'FORM.报销金额': 'formData.amount',
    });
    expenseType.label = '后来修改的名称'; amount.label = '新金额名称';
    const created = await call(workflowInstanceContract.create, { definitionId: 2, title: '高级模板', formData: {
      expenseType: 'TRAVEL', amount: 120, username: 'FORGED', 费用类型: 'FORGED',
    } });
    expect(created.status).toBe(200); expect(created.body.code).toBe(0);
    expect(created.body.data.serialNo).toMatch(/^admin-TRAVEL-00-120-\d{6}$/);
    expect(mockNumberingAllocations.at(-1)?.businessKey).toBe(String(created.body.data.id));
  });
});
