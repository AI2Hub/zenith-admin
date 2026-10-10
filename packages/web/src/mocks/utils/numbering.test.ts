import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from '@zenith/shared/seed';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from '@/mocks/data/numbering';
import { allocateMockBusinessNumber, attachMockBusinessNumber, resolveMockNumberingReference, withMockNumberingTransaction } from './numbering';

const at = new Date('2026-10-11T01:00:00Z');
const payment = { scene: 'payment.order', tenantId: null, allocationKey: 'order:1', at };

beforeEach(() => {
  mockNumberingRules.splice(0, mockNumberingRules.length, ...structuredClone(SEED_NUMBERING_RULES));
  mockNumberingVersions.splice(0, mockNumberingVersions.length, ...structuredClone(SEED_NUMBERING_VERSIONS));
  mockNumberingBindings.splice(0, mockNumberingBindings.length, ...structuredClone(SEED_NUMBERING_BINDINGS));
  mockNumberingAllocations.length = 0;
  mockNumberingCounters.length = 0;
});

describe('Demo 统一编号分配', () => {
  it('同一业务重试返回原号，切换绑定版本后仍不重复消费', () => {
    const number = allocateMockBusinessNumber(payment);
    const binding = mockNumberingBindings.find(row => row.scene === payment.scene)!;
    binding.versionId = 99999;
    expect(allocateMockBusinessNumber(payment)).toBe(number);
    expect(mockNumberingCounters[0]?.value).toBe('1');
    expect(mockNumberingAllocations).toHaveLength(1);
    expect(() => allocateMockBusinessNumber({ ...payment, context: { changed: 'yes' } })).toThrow();
  });

  it('先回滚业务和编号，再重试仍从同一流水起始', () => {
    const rows: { id: number; number?: string }[] = [];
    expect(() => withMockNumberingTransaction(() => {
      rows.push({ id: 1 });
      rows[0]!.number = allocateMockBusinessNumber(payment);
      throw new Error('业务校验失败');
    }, [rows])).toThrow('业务校验失败');
    expect(rows).toEqual([]);
    expect(mockNumberingCounters).toEqual([]);
    expect(mockNumberingAllocations).toEqual([]);
    const number = withMockNumberingTransaction(() => {
      const number = allocateMockBusinessNumber(payment);
      rows.push({ id: 1, number });
      attachMockBusinessNumber({ scene: payment.scene, tenantId: null, number, businessKey: '1' });
      return number;
    }, [rows]);
    expect(number.endsWith('000001')).toBe(true);
    expect(mockNumberingAllocations[0]?.businessKey).toBe('1');
    expect(rows).toEqual([{ id: 1, number }]);
  });

  it('全局支付流水跨租户共享，日切换使用新周期', () => {
    const first = allocateMockBusinessNumber({ ...payment, tenantId: 1 });
    const second = allocateMockBusinessNumber({ ...payment, tenantId: 2 });
    expect(first.endsWith('000001')).toBe(true);
    expect(second.endsWith('000002')).toBe(true);
    const tomorrow = allocateMockBusinessNumber({ ...payment, allocationKey: 'order:2', at: new Date('2026-10-12T01:00:00Z') });
    expect(tomorrow.endsWith('000001')).toBe(true);
    expect(mockNumberingCounters.map(row => [row.periodKey, row.value])).toEqual([['20261011', '2'], ['20261012', '1']]);
  });

  it('租户业务绑定优先，固定版本编号不受其他版本影响', () => {
    const rule = structuredClone(mockNumberingRules.find(row => row.scene === 'workflow.instance')!);
    rule.id = 101; rule.tenantId = 7; rule.draft.template = 'CUSTOM{YYYYMMDD}{SEQ:6}';
    mockNumberingRules.push(rule);
    mockNumberingVersions.push({ id: 101, ruleId: 101, version: 1, config: rule.draft, createdBy: null, createdAt: at.toISOString() });
    mockNumberingBindings.push({ ...mockNumberingBindings[0]!, id: 101, tenantId: 7, ruleId: 101, versionId: 101 });
    const request = { scene: 'workflow.instance', tenantId: 7, ownerKey: '32' };
    expect(resolveMockNumberingReference(request).versionId).toBe(101);
    const number = allocateMockBusinessNumber({ ...request, allocationKey: 'instance:20', at });
    expect(number.startsWith('CUSTOM')).toBe(true);
    expect(mockNumberingCounters[0]?.scopeKey).toBe('tenant:7/owner:32');
    expect(() => allocateMockBusinessNumber({ ...request, tenantId: 8, ruleId: 101, ruleVersionId: 101, allocationKey: 'instance:21', at })).toThrow();
  });

  it('重复号码冲突不会消费计数，也不会留下分配记录', () => {
    allocateMockBusinessNumber(payment);
    const source = mockNumberingRules.find(row => row.scene === payment.scene)!;
    mockNumberingRules.push({ ...structuredClone(source), id: 100 });
    mockNumberingVersions.push({ id: 100, ruleId: 100, version: 1, config: structuredClone(source.draft), createdBy: null, createdAt: at.toISOString() });
    expect(() => allocateMockBusinessNumber({ ...payment, allocationKey: 'order:collision', ruleId: 100, ruleVersionId: 100 })).toThrow();
    expect(mockNumberingCounters).toHaveLength(1);
    expect(mockNumberingAllocations).toHaveLength(1);
  });
});
