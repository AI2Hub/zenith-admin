import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbTransaction } from '../../db/types';
import type { WorkflowFlowData } from '@zenith/shared/workflow';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), allocate: vi.fn(), attach: vi.fn(), lockBinding: vi.fn() }));
vi.mock('../platform/numbering-runtime', () => ({ resolveNumberingVersion: mocks.resolve, allocateBusinessNumber: mocks.allocate, attachBusinessNumber: mocks.attach }));
vi.mock('../platform/numbering-binding-lock', () => ({ lockNumberingBinding: mocks.lockBinding }));
import { numberingBindings } from '../../db/schema';
import { allocateWorkflowInstanceNumber, pinWorkflowNumbering, requirePinnedWorkflowNumbering } from './workflow-numbering.service';

function transaction(...results: unknown[][]): DbTransaction {
  const chain = { from: vi.fn(), where: vi.fn(), leftJoin: vi.fn(), limit: vi.fn() };
  chain.from.mockReturnValue(chain); chain.where.mockReturnValue(chain); chain.leftJoin.mockReturnValue(chain);
  for (const rows of results) chain.limit.mockResolvedValueOnce(rows);
  const insert = { values: vi.fn(), onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
  insert.values.mockReturnValue(insert);
  return { select: vi.fn(() => chain), insert: vi.fn(() => insert) } as unknown as DbTransaction;
}
const ref = { ruleId: 7, versionId: 9, parameterMapping: {} };
const flow = (): WorkflowFlowData => ({ nodes: [], edges: [], settings: { allowWithdraw: true, allowResubmit: true, notifyInitiator: true, numbering: ref } });
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ rule: { id: 7 }, version: { id: 9, config: { template: 'WF-{SEQ}' } } }); mocks.allocate.mockResolvedValue('WF-0001'); });

describe('workflow numbering integration', () => {
  it('pins a default rule and preserves an explicitly selected historical version on subsequent publish', async () => {
    const tx = transaction();
    const pinned = await pinWorkflowNumbering(tx, { id: 3, tenantId: null, formId: null, flowData: { nodes: [], edges: [] } });
    expect(pinned.settings?.numbering).toEqual(ref);
    await pinWorkflowNumbering(tx, { id: 3, tenantId: null, formId: null, flowData: pinned });
    expect(mocks.resolve).toHaveBeenLastCalledWith(tx, expect.objectContaining({ ruleId: 7, ruleVersionId: 9, ownerKey: '3' }));
    expect(tx.insert).toHaveBeenCalledWith(numberingBindings);
    const insert = vi.mocked(tx.insert).mock.results[0]!.value;
    expect(insert.values).toHaveBeenCalledWith({ scene: 'workflow.instance', tenantId: null, ownerKey: '3', ruleId: 7, versionId: 9, parameterMapping: {} });
  });
  it('blocks enabling unpinned definitions and publishing missing parameter sources', async () => {
    await expect(pinWorkflowNumbering(transaction(), { id: 3, tenantId: null, formId: null, flowData: { nodes: [], edges: [] } }, true)).rejects.toThrow('重新发布');
    mocks.resolve.mockResolvedValue({ rule: { id: 7 }, version: { id: 9, config: { template: '{categoryCode}-{SEQ}' } } });
    await expect(pinWorkflowNumbering(transaction(), { id: 3, tenantId: null, formId: null, flowData: flow() })).rejects.toThrow('必须映射');
  });
  it('uses the real initiating user, a stable instance key and the published version, attaching in the same transaction', async () => {
    const tx = transaction([{ username: 'scheduled-user', nickname: '定时发起人', departmentId: 12, departmentCode: 'FIN', departmentName: '财务' }], [{ code: 'T2' }]);
    expect(await allocateWorkflowInstanceNumber(tx, { instanceId: 82, definitionId: 3, tenantId: 2, initiatorId: 91, flowData: flow(), formData: {}, formSnapshot: null })).toBe('WF-0001');
    expect(mocks.allocate).toHaveBeenCalledWith(tx, expect.objectContaining({ allocationKey: 'instance:82', ownerKey: '3', ruleVersionId: 9, tenantId: 2,
      context: expect.objectContaining({ username: 'scheduled-user', departmentCode: 'FIN', tenantCode: 'T2' }) }));
    expect(mocks.attach).toHaveBeenCalledWith(tx, { scene: 'workflow.instance', tenantId: 2, ownerKey: '3', number: 'WF-0001', businessKey: '82' });
  });
  it('never follows a mutable current rule for an unpinned running definition', async () => {
    await expect(allocateWorkflowInstanceNumber(transaction(), { instanceId: 1, definitionId: 3, tenantId: null, initiatorId: 1, flowData: { nodes: [], edges: [] }, formData: {}, formSnapshot: null })).rejects.toThrow('重新发布');
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it.each(['custom', 'external'] as const)('validates %s numbering sources against declared business variables', async formType => {
    mocks.resolve.mockResolvedValue({ rule: { id: 7 }, version: { id: 9, config: { template: '{categoryCode}-{SEQ}' } } });
    const flowData = flow();
    flowData.settings!.numbering = { ...ref, parameterMapping: { categoryCode: 'formData.category' } };
    const input = { id: 3, tenantId: 2, formId: null, flowData, formType,
      customForm: { createComponent: 'biz/TestForm', variables: [{ key: 'category', label: '分类', type: 'string' as const }] } };
    expect((await pinWorkflowNumbering(transaction(), input)).settings?.numbering?.parameterMapping).toEqual({ categoryCode: 'formData.category' });
    await expect(pinWorkflowNumbering(transaction(), { ...input, customForm: { createComponent: 'biz/TestForm', variables: [] } })).rejects.toThrow('不存在');
  });
  it('validates designer fields from the tenant-scoped schema and fails when a source is unavailable', async () => {
    mocks.resolve.mockResolvedValue({ rule: { id: 7 }, version: { id: 9, config: { template: '{categoryCode}-{SEQ}' } } });
    const flowData = flow();
    flowData.settings!.numbering = { ...ref, parameterMapping: { categoryCode: 'formData.category' } };
    const input = { id: 3, tenantId: 2, formId: 5, flowData, formType: 'designer' as const };
    const tx = transaction([{ schema: { fields: [{ key: 'category', label: '分类', type: 'select' }] } }]);
    expect((await pinWorkflowNumbering(tx, input)).settings?.numbering?.versionId).toBe(9);
    await expect(pinWorkflowNumbering(transaction([]), input)).rejects.toThrow('不存在');
  });
  it('fails before allocation if the real initiating user cannot be resolved', async () => {
    await expect(allocateWorkflowInstanceNumber(transaction([]), { instanceId: 1, definitionId: 3, tenantId: 2,
      initiatorId: 99, flowData: flow(), formData: {}, formSnapshot: null })).rejects.toThrow('发起人不存在');
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it('locks the owner binding before reading/locking the rule and does not publish a binding until that lock is acquired', async () => {
    let unlock!: () => void;
    mocks.lockBinding.mockImplementationOnce(() => new Promise<void>(resolve => { unlock = resolve; }));
    const tx = transaction();
    const pending = pinWorkflowNumbering(tx, { id: 3, tenantId: 2, formId: null, flowData: flow() });
    expect(mocks.lockBinding).toHaveBeenCalledWith(tx, { scene: 'workflow.instance', tenantId: 2, ownerKey: '3' });
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(tx.insert).not.toHaveBeenCalled();
    unlock(); await pending;
    expect(mocks.resolve).toHaveBeenCalledOnce(); expect(tx.insert).toHaveBeenCalledOnce();
  });
  it('checks enabling and fixed draft references without rewriting the owner preset', async () => {
    const tx = transaction([{ flowData: flow() }]);
    expect((await pinWorkflowNumbering(tx, { id: 3, tenantId: null, formId: null, version: 1, flowData: flow() }, true)).settings?.numbering).toEqual(ref);
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.lockBinding).not.toHaveBeenCalled(); expect(tx.insert).not.toHaveBeenCalled();
  });
  it('uses the frozen reference for a draft without consulting or changing mutable form metadata', async () => {
    const tx = transaction();
    const flowData = flow();
    flowData.settings!.numbering = { ...ref, parameterMapping: { categoryCode: 'formData.原始分类' } };
    await expect(requirePinnedWorkflowNumbering(tx, { id: 3, tenantId: 2, flowData })).resolves.toEqual(flowData.settings!.numbering);
    expect(tx.select).not.toHaveBeenCalled(); expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalledWith(tx, expect.objectContaining({ ruleId: 7, ruleVersionId: 9 }));
  });
  it('enabling compares the published numbering snapshot without rereading the current form, and rejects changed mappings', async () => {
    const flowData = flow();
    flowData.settings!.numbering = { ...ref, parameterMapping: { categoryCode: 'formData.original' } };
    const tx = transaction([{ flowData }]);
    await expect(pinWorkflowNumbering(tx, { id: 3, tenantId: 2, formId: 99, version: 2, flowData }, true)).resolves.toEqual(flowData);
    expect(tx.select).toHaveBeenCalledOnce(); expect(tx.insert).not.toHaveBeenCalled();
    const changed = structuredClone(flowData);
    changed.settings!.numbering!.parameterMapping.categoryCode = 'formData.changed';
    await expect(pinWorkflowNumbering(transaction([{ flowData }]), { id: 3, tenantId: 2, formId: 99, version: 2, flowData: changed }, true)).rejects.toThrow('重新发布');
  });
  it('does not persist an owner binding when parameter validation fails', async () => {
    mocks.resolve.mockResolvedValue({ rule: { id: 7 }, version: { id: 9, config: { template: '{categoryCode}-{SEQ}' } } });
    const tx = transaction();
    await expect(pinWorkflowNumbering(tx, { id: 3, tenantId: null, formId: null, flowData: flow() })).rejects.toThrow('必须映射');
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it('automatically resolves multiple FORM labels into actual keys and freezes them in the owner binding', async () => {
    mocks.resolve.mockResolvedValue({ rule: { id: 7 }, version: { id: 9, config: { template: '{FORM.地区}-{SEQ:3}-{FORM.类别}-{YYMMDD}-{DEPT_CODE}' } } });
    const fields = [{ key: 'regionCode', label: '地区', type: 'text' }, { key: 'category', label: '类别', type: 'select' }];
    const tx = transaction([{ schema: { fields } }]);
    const pinned = await pinWorkflowNumbering(tx, { id: 3, tenantId: 2, formId: 5, flowData: flow() });
    const parameterMapping = { 'FORM.地区': 'formData.regionCode', 'FORM.类别': 'formData.category' };
    expect(pinned.settings?.numbering).toEqual({ ...ref, parameterMapping });
    expect(vi.mocked(tx.insert).mock.results[0]!.value.values).toHaveBeenCalledWith(expect.objectContaining({ parameterMapping, ownerKey: '3' }));
  });
  it('reads fixed multi-FORM mappings against the actual snapshot, keeping trusted identities and ignoring changed labels', async () => {
    const flowData = flow();
    flowData.settings!.numbering = { ...ref, parameterMapping: { 'FORM.地区': 'formData.regionCode', 'FORM.类别': 'formData.category' } };
    const input = { instanceId: 82, definitionId: 3, tenantId: null, initiatorId: 91, flowData,
      formData: { regionCode: 'CN', category: 'A', 地区: 'FORGED', departmentCode: 'FORGED' },
      formSnapshot: { formType: 'designer' as const, formId: 5, formName: '业务表单', fields: [
        { key: 'regionCode', label: '地区已改名', type: 'text' as const }, { key: 'category', label: '类别已改名', type: 'select' as const },
      ], settings: null, customForm: null } };
    const initiator = { username: 'actual-user', nickname: '真实发起人', departmentId: 12, departmentCode: 'FIN', departmentName: '财务' };
    await allocateWorkflowInstanceNumber(transaction([initiator]), input);
    expect(mocks.allocate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      context: expect.objectContaining({ 'FORM.地区': 'CN', 'FORM.类别': 'A', departmentCode: 'FIN', username: 'actual-user' }),
    }));
    mocks.allocate.mockClear();
    await expect(allocateWorkflowInstanceNumber(transaction([initiator]), { ...input, formSnapshot: { ...input.formSnapshot, fields: [] } })).rejects.toThrow('不存在');
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
});
