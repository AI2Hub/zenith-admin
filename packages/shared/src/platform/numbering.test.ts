import { describe, expect, it } from 'vitest';
import { numberingConfigSchema, updateNumberingRuleSchema, type NumberingConfig } from './numbering-validation';
import { parseNumberingTemplate, previewBusinessNumbers, renderBusinessNumber, resolveNumberingPeriodKey, serializeNumberingTemplate, validateNumberingConfig } from './numbering';
import { getNumberingScene } from './numbering-scenes';

const config: NumberingConfig = {
  template: 'QJ-{YYYYMMDD}-{SEQ:4}', start: '1', step: '1', width: 4,
  resetPeriod: 'daily', timezone: 'Asia/Shanghai', scope: 'tenant',
};
const at = '2026-10-11T02:00:00Z';

describe('编号规则核心', () => {
  it('分段配置与高级模板往返使用同一模型', () => {
    const template = 'QJ-{departmentId}-{YYYY}{MM}{DD}-{SEQ:4}';
    expect(serializeNumberingTemplate(parseNumberingTemplate(template))).toBe(template);
    expect(parseNumberingTemplate('{SEQ}')).toEqual([{ kind: 'sequence' }]);
  });

  it('拒绝未知参数、不完整括号、重复流水及两位年份', () => {
    expect(() => parseNumberingTemplate('QJ-{YYYYMMDD')).toThrow('括号');
    expect(() => parseNumberingTemplate('QJ-{YY}-{SEQ:4}')).toThrow('不支持');
    expect(validateNumberingConfig({ ...config, template: '{missing}{YYYYMMDD}{SEQ:4}' }, 'biz.leave')).toContain('当前业务未声明参数：missing');
    expect(validateNumberingConfig({ ...config, template: '{YYYYMMDD}-{SEQ:4}-{SEQ:4}' }, 'biz.leave')).toContain('编号模板必须且只能包含一个流水片段');
    expect(validateNumberingConfig({ ...config, template: '{YYYYMMDD}-{SEQ:8}' }, 'biz.leave')).toContain('模板流水位数须与流水设置一致');
  });

  it('缺失变量不静默清空，保留中文动态参数', () => {
    const workflow = { ...config, template: '{YYYYMMDD}-{departmentName}-{SEQ:4}' };
    expect(() => renderBusinessNumber(workflow, { sequence: '1', at }, 'workflow.instance')).toThrow('缺少编号参数：departmentName');
    expect(renderBusinessNumber(workflow, { sequence: '1', at, context: { departmentName: '人事部' } }, 'workflow.instance')).toBe('20261011-人事部-0001');
    expect(() => renderBusinessNumber(workflow, { sequence: '1', at, context: { departmentName: '人事 部' } }, 'workflow.instance')).toThrow('空白');
  });

  it('使用精确大整数分配结果，预览按起始值与步长推算且不改变输入', () => {
    const large = { ...config, start: '9007199254740993', step: '2', template: 'QJ{SEQ}', resetPeriod: 'never' as const };
    expect(previewBusinessNumbers(large, { scene: 'biz.leave', at }).numbers).toEqual(['QJ9007199254740993', 'QJ9007199254740995', 'QJ9007199254740997']);
    expect(renderBusinessNumber(large, { sequence: 9007199254740999n, at }, 'biz.leave')).toBe('QJ9007199254740999');
    expect(large.start).toBe('9007199254740993');
    expect(() => renderBusinessNumber(large, { sequence: '9223372036854775808', at }, 'biz.leave')).toThrow('bigint');
    expect(numberingConfigSchema.safeParse({ ...config, start: '9223372036854775808' }).success).toBe(false);
  });

  it('日期渲染与周期边界使用同一指定时区', () => {
    const before = '2026-12-31T15:59:59Z';
    const after = '2026-12-31T16:00:00Z';
    expect(resolveNumberingPeriodKey(config, before)).toBe('20261231');
    expect(resolveNumberingPeriodKey(config, after)).toBe('20270101');
    expect(renderBusinessNumber(config, { sequence: '1', at: after }, 'biz.leave')).toBe('QJ-20270101-0001');
    expect(resolveNumberingPeriodKey({ ...config, timezone: 'UTC' }, after)).toBe('20261231');
    expect(() => resolveNumberingPeriodKey(config, '2026-12-31 16:00:00')).toThrow('时区偏移');
    expect(numberingConfigSchema.safeParse({ ...config, timezone: 'Invalid/Zone' }).success).toBe(false);
  });

  it('周期与流水范围必须能区分重置后的号码', () => {
    expect(validateNumberingConfig({ ...config, template: '{MM}{DD}-{SEQ:4}' }, 'biz.leave').join()).toContain('四位年份');
    expect(validateNumberingConfig({ ...config, template: '{YYYY}{MM}-{SEQ:4}' }, 'biz.leave').join()).toContain('日期');
    expect(validateNumberingConfig({ ...config, scope: 'department' }, 'biz.leave').join()).toContain('departmentId');
    expect(validateNumberingConfig({ ...config, scope: 'department', template: 'QJ-{departmentId}-{YYYYMMDD}-{SEQ:4}' }, 'biz.leave')).toEqual([]);
    expect(resolveNumberingPeriodKey({ ...config, resetPeriod: 'monthly' }, at)).toBe('202610');
    expect(resolveNumberingPeriodKey({ ...config, resetPeriod: 'yearly' }, at)).toBe('2026');
  });

  it('渠道约束、全局范围及实际长度在预览和正式渲染一致校验', () => {
    expect(validateNumberingConfig(config, 'payment.order').join()).toContain('不允许此流水范围');
    expect(validateNumberingConfig({ ...config, scope: 'global' }, 'payment.order').join()).toContain('不支持的字符');
    const payment = { ...config, scope: 'global' as const, template: 'PO{YYYYMMDD}{SEQ:4}' };
    expect(renderBusinessNumber(payment, { sequence: '1', at }, 'payment.order')).toBe('PO202610110001');
    expect(() => renderBusinessNumber({ ...payment, template: 'PAYMENTORDER{YYYYMMDD}{SEQ:4}' }, { sequence: '9007199254740993', at }, 'payment.order')).toThrow('超过业务允许');
    expect(getNumberingScene('payment.capture').uniqueNamespace).toBe('payment.order');
    expect(getNumberingScene('payment.deduction').uniqueNamespace).toBe('payment.order');
  });

  it('部分更新不重置省略字段，并要求并发版本', () => {
    expect(updateNumberingRuleSchema.parse({ name: '新名称', expectedRevision: 3 })).toEqual({ name: '新名称', expectedRevision: 3 });
    expect(updateNumberingRuleSchema.safeParse({ name: '新名称' }).success).toBe(false);
  });

  it.each([
    '{departmentId}{SEQ:1}',
    '{categoryCode}-{departmentId}-{SEQ:1}',
    '{tenantId}0{departmentId}-{SEQ:1}',
    '{departmentId}-{categoryCode}{SEQ:1}',
    '{SEQ:1}-{departmentId}',
  ])('拒绝可能因参数拼接或流水扩位重复的模板 %s', template => {
    expect(validateNumberingConfig({ ...config, template, width: 1, scope: 'department', resetPeriod: 'never' }, 'biz.leave').length).toBeGreaterThan(0);
  });

  it('拒绝文本参数夹在日期片段间伪造重置周期', () => {
    const ambiguous = { ...config, template: '{YYYY}{categoryCode}{MM}{nickname}{DD}-{SEQ:4}' };
    expect(validateNumberingConfig(ambiguous, 'workflow.instance').join()).toContain('日期片段必须放在业务文本参数之前');
  });

  it('多个数字范围、文本含分隔符、流水扩位和不同周期仍保持不同号码', () => {
    const safe = { ...config, template: 'QJ-{YYYYMMDD}-{tenantId}-{departmentId}-{categoryCode}-{SEQ:1}X', width: 1, scope: 'department' as const };
    expect(validateNumberingConfig(safe, 'biz.leave')).toEqual([]);
    const numbers: string[] = [];
    for (const tenantId of ['1', '12']) for (const departmentId of ['1', '12']) {
      for (const sequence of ['1', '3', '23', '99', '10001']) for (const categoryCode of ['A', 'A-12-23', '01B02C']) {
        for (const date of ['2026-01-11T00:00:00Z', '2026-02-11T00:00:00Z']) {
          numbers.push(renderBusinessNumber(safe, { sequence, at: date, context: { tenantId, departmentId, categoryCode } }, 'biz.leave'));
        }
      }
    }
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(() => renderBusinessNumber(safe, { sequence: '1', at, context: { tenantId: '1-12', departmentId: '3', categoryCode: 'A' } }, 'biz.leave')).toThrow('规范的非负整数');
  });
});
