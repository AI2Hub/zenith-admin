import { describe, expect, it } from 'vitest';
import { numberingConfigSchema, updateNumberingRuleSchema, type NumberingConfig } from './numbering-validation';
import { getNumberingTemplateBusinessParameters, getNumberingTemplateParameters, parseNumberingTemplate, previewBusinessNumbers, renderBusinessNumber, resolveNumberingPeriodKey, serializeNumberingTemplate, validateNumberingConfig, validateNumberingParameterMapping } from './numbering';
import { parseNumberingFormFieldSource } from './numbering-reference';
import { getNumberingScene } from './numbering-scenes';

const config: NumberingConfig = {
  template: 'QJ-{YYYYMMDD}-{SEQ:4}', start: '1', step: '1', width: 4,
  resetPeriod: 'daily', timezone: 'Asia/Shanghai', scope: 'tenant',
};
const at = '2026-10-11T02:00:00Z';

describe('编号规则核心', () => {
  it('表单映射保留中文和连字符字段编码，拒绝空编码、控制字符、超长与原型保留字', () => {
    for (const key of ['分类编码', 'category-code', '分类.编码']) {
      expect(parseNumberingFormFieldSource(`formData.${key}`)).toBe(key);
      expect(validateNumberingParameterMapping('workflow.instance', { categoryCode: `formData.${key}` })).toEqual([]);
    }
    const longestKey = 'x'.repeat(247);
    expect(parseNumberingFormFieldSource(`formData.${longestKey}`)).toBe(longestKey);
    for (const source of ['formData.', 'formData. ', 'formData.a\nb', 'formData.__proto__', 'formData.constructor', 'formData.prototype', `formData.${longestKey}x`, 'other.category']) {
      expect(parseNumberingFormFieldSource(source)).toBeUndefined();
      expect(validateNumberingParameterMapping('workflow.instance', { categoryCode: source })).not.toEqual([]);
    }
  });
  it('分段配置与高级模板往返使用同一模型', () => {
    const template = 'QJ-{departmentId}-{YYYY}{MM}{DD}-{SEQ:4}';
    expect(serializeNumberingTemplate(parseNumberingTemplate(template))).toBe(template);
    expect(parseNumberingTemplate('{SEQ}')).toEqual([{ kind: 'sequence' }]);
  });

  it('拒绝未知参数、不完整括号和没有流水的模板', () => {
    expect(() => parseNumberingTemplate('QJ-{YYYYMMDD')).toThrow('括号');
    expect(() => parseNumberingTemplate('QJ-{UNKNOWN}-{SEQ:4}')).toThrow('不支持');
    expect(validateNumberingConfig({ ...config, template: '{missing}{YYYYMMDD}{SEQ:4}' }, 'biz.leave')).toContain('当前业务未声明参数：missing');
    expect(validateNumberingConfig({ ...config, template: '{YYYYMMDD}' }, 'biz.leave')).toContain('编号模板必须包含流水片段');
  });

  it('缺失变量不静默清空，保留中文动态参数', () => {
    const workflow = { ...config, template: '{YYYYMMDD}-{departmentName}-{SEQ:4}' };
    expect(() => renderBusinessNumber(workflow, { sequence: '1', at }, 'workflow.instance')).toThrow('缺少编号参数：departmentName');
    expect(renderBusinessNumber(workflow, { sequence: '1', at, context: { departmentName: '人事部' } }, 'workflow.instance')).toBe('20261011-人事部-0001');
    expect(renderBusinessNumber(workflow, { sequence: '1', at, context: { departmentName: '人事 \n部\t' } }, 'workflow.instance')).toBe('20261011-人事部-0001');
    expect(() => renderBusinessNumber(workflow, { sequence: '1', at, context: { departmentName: ' \n ' } }, 'workflow.instance')).toThrow('缺少编号参数');
    expect(() => renderBusinessNumber(workflow, { sequence: '1', at, context: Object.create({ departmentName: 'FORGED' }) }, 'workflow.instance')).toThrow('缺少编号参数');
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
    expect(validateNumberingConfig({ ...config, template: '{MM}{DD}-{SEQ:4}' }, 'biz.leave').join()).toContain('年份');
    expect(validateNumberingConfig({ ...config, template: '{YYMMDD}-{SEQ:4}' }, 'biz.leave')).toEqual([]);
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
  ])('允许自由排列模板，由最终业务唯一约束处理真实碰撞 %s', template => {
    expect(validateNumberingConfig({ ...config, template, width: 1, scope: 'department', resetPeriod: 'never' }, 'biz.leave')).toEqual([]);
  });

  it('允许参数夹在日期片段间，预览与正式渲染使用同一顺序', () => {
    const ambiguous = { ...config, template: '{YYYY}{categoryCode}{MM}{nickname}{DD}-{SEQ:4}' };
    expect(validateNumberingConfig(ambiguous, 'workflow.instance')).toEqual([]);
    expect(renderBusinessNumber(ambiguous, { sequence: '1', at, context: { categoryCode: 'BX', nickname: '管理员' } }, 'workflow.instance')).toBe('2026BX10管理员11-0001');
  });

  it('对齐原有高级模板全部日期、系统别名和多个不同表单字段', () => {
    const legacy = { ...config, scope: 'owner' as const, template: '{SEQ:2}-{YY}-{YYMMDD}-{HHmmss}-{YYYYMMDDHHmmss}-{DEPT}-{DEPT_CODE}-{USER}-{NICKNAME}-{TENANT}-{FORM.事由}-{form.category.code}-{SEQ:6}' };
    expect(getNumberingTemplateParameters(legacy.template)).toEqual(['departmentName', 'departmentCode', 'username', 'nickname', 'tenantId', 'FORM.事由', 'FORM.category.code']);
    expect(getNumberingTemplateBusinessParameters(legacy.template)).toEqual(['FORM.事由', 'FORM.category.code']);
    expect(renderBusinessNumber(legacy, { sequence: '7', at, context: {
      departmentName: '研发 部', departmentCode: 'RD', username: 'zhangsan', nickname: '张三', tenantId: 1,
      'FORM.事由': '报销\n申请', 'FORM.category.code': '差旅',
    } }, 'workflow.instance')).toBe('07-26-261011-100000-20261011100000-研发部-RD-zhangsan-张三-1-报销申请-差旅-000007');
    expect(getNumberingTemplateParameters('{ dept_code }-{DEPT_CODE}-{ seq:2 }-{FORM.分类}-{form.分类}')).toEqual(['departmentCode', 'FORM.分类']);
  });

  it('零起始值、多SEQ各自宽度与缺省宽度共用同一个精确流水', () => {
    const flexible = { ...config, start: '0', step: '2', resetPeriod: 'never' as const, template: '{SEQ:2}-{SEQ:6}-{SEQ}' };
    expect(numberingConfigSchema.safeParse(flexible).success).toBe(true);
    expect(previewBusinessNumbers(flexible, { scene: 'workflow.instance', at }).numbers).toEqual(['00-000000-0000', '02-000002-0002', '04-000004-0004']);
    expect(() => renderBusinessNumber(flexible, { sequence: '-1', at }, 'workflow.instance')).toThrow('非负整数');
    expect(numberingConfigSchema.safeParse({ ...flexible, start: '00' }).success).toBe(false);
    expect(numberingConfigSchema.safeParse({ ...flexible, step: '0' }).success).toBe(false);
  });

  it('FORM只供工作流使用并防止非法字段与身份覆盖，缺参或非有限数值明确报错', () => {
    const formConfig = { ...config, template: '{YYMMDD}-{FORM.分类}-{SEQ}' };
    expect(validateNumberingConfig(formConfig, 'workflow.instance')).toEqual([]);
    expect(validateNumberingConfig(formConfig, 'biz.leave')).toContain('当前业务未声明参数：FORM.分类');
    expect(validateNumberingParameterMapping('workflow.instance', { 'FORM.分类': 'formData.category' })).toEqual([]);
    expect(validateNumberingParameterMapping('workflow.instance', { USER: 'formData.category' }).join()).toContain('不允许映射覆盖');
    for (const token of ['FORM.', 'FORM.__proto__', 'FORM.constructor', 'FORM.prototype']) expect(() => parseNumberingTemplate(`{${token}}-{SEQ}`)).toThrow('不支持');
    expect(() => renderBusinessNumber(formConfig, { sequence: '1', at }, 'workflow.instance')).toThrow('缺少编号参数：FORM.分类');
    expect(() => renderBusinessNumber(formConfig, { sequence: '1', at, context: { 'FORM.分类': Number.NaN } }, 'workflow.instance')).toThrow('有限数值');
    expect(() => renderBusinessNumber(formConfig, { sequence: '1', at, context: { 'FORM.分类': 'x'.repeat(65) } }, 'workflow.instance')).toThrow('64');
    const excessive = { ...config, scope: 'global' as const, template: '{SEQ:20}{SEQ:20}' };
    expect(validateNumberingConfig(excessive, 'payment.order').join()).toContain('32');
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
