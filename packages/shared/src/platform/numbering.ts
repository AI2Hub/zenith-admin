import { NUMBERING_DATE_TOKENS, NUMBERING_MAX_SEQUENCE, NUMBERING_SYSTEM_PARAMETERS } from './constants';
import { getNumberingScene } from './numbering-scenes';
import type { NumberingConfig } from './numbering-validation';
import { normalizeNumberingParameter, parseNumberingFormFieldSource, parseNumberingFormParameter } from './numbering-reference';

export type NumberingSegment =
  | { kind: 'literal'; value: string }
  | { kind: 'date'; value: typeof NUMBERING_DATE_TOKENS[number] }
  | { kind: 'sequence'; width?: number }
  | { kind: 'parameter'; value: string };

/** 严格解析，未闭合括号和未知格式不能悄悄成为空文本。参数是否存在由场景校验。 */
export function parseNumberingTemplate(template: string): NumberingSegment[] {
  const segments: NumberingSegment[] = [];
  let offset = 0;
  for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
    const literal = template.slice(offset, match.index);
    if (/[{}]/.test(literal)) throw new Error('编号模板括号不完整');
    if (literal) segments.push({ kind: 'literal', value: literal });
    const token = match[1]!.trim();
    if ((NUMBERING_DATE_TOKENS as readonly string[]).includes(token)) {
      segments.push({ kind: 'date', value: token as typeof NUMBERING_DATE_TOKENS[number] });
    } else if (/^SEQ(?::(?:[1-9]|[12]\d|3[0-2]))?$/i.test(token)) {
      segments.push({ kind: 'sequence', ...(token.includes(':') ? { width: Number(token.split(':')[1]) } : {}) });
    } else if (parseNumberingFormParameter(token) !== undefined || /^[a-z][A-Za-z0-9]*$/.test(normalizeNumberingParameter(token))) {
      segments.push({ kind: 'parameter', value: normalizeNumberingParameter(token) });
    } else throw new Error(`不支持的编号片段：{${token}}`);
    offset = match.index + match[0].length;
  }
  const rest = template.slice(offset);
  if (/[{}]/.test(rest)) throw new Error('编号模板括号不完整');
  if (rest) segments.push({ kind: 'literal', value: rest });
  return segments;
}

/** Canonical parameter keys required by a template, in first-use order. */
export function getNumberingTemplateParameters(template: string): string[] {
  return [...new Set(parseNumberingTemplate(template).flatMap(segment => segment.kind === 'parameter' ? [segment.value] : []))];
}

/** Business fields require a published binding; identity variables always come from trusted context. */
export function getNumberingTemplateBusinessParameters(template: string): string[] {
  return getNumberingTemplateParameters(template).filter(parameter => !(NUMBERING_SYSTEM_PARAMETERS as readonly string[]).includes(parameter));
}

export function serializeNumberingTemplate(segments: readonly NumberingSegment[]): string {
  return segments.map(segment => {
    if (segment.kind === 'literal') {
      if (/[{}]/.test(segment.value)) throw new Error('固定文本不能包含花括号');
      return segment.value;
    }
    return segment.kind === 'sequence'
      ? `{SEQ${segment.width === undefined ? '' : `:${segment.width}`}}`
      : `{${segment.value}}`;
  }).join('');
}

/** 绑定只能映射显式业务参数；身份、租户与范围参数由可信业务上下文提供。 */
export function validateNumberingParameterMapping(sceneCode: string, mapping: Readonly<Record<string, string>>): string[] {
  const scene = getNumberingScene(sceneCode);
  const errors: string[] = [];
  for (const [key, source] of Object.entries(mapping)) {
    if (sceneCode !== 'workflow.instance') errors.push('仅流程业务支持表单参数映射');
    else if ((NUMBERING_SYSTEM_PARAMETERS as readonly string[]).includes(normalizeNumberingParameter(key))) errors.push(`系统身份参数 ${key} 不允许映射覆盖`);
    else if (parseNumberingFormParameter(key) === undefined && !scene.parameters.some(parameter => parameter.key === key)) errors.push(`当前业务未声明参数：${key}`);
    else if (parseNumberingFormFieldSource(source) === undefined) errors.push(`参数 ${key} 必须映射到有效的 formData.字段编码（__proto__、constructor、prototype 为保留字）`);
  }
  return errors;
}

const numericIdentityParameters = new Set(['tenantId', 'departmentId']);

/** 配置使用十进制字符串，超过 JS 安全整数范围时仍可准确取号。 */
export function validateNumberingConfig(config: NumberingConfig, sceneCode?: string): string[] {
  const errors: string[] = [];
  if (!/^(?:0|[1-9]\d{0,18})$/.test(config.start) || BigInt(config.start) > BigInt(NUMBERING_MAX_SEQUENCE)) errors.push(`起始值必须为 0 至 ${NUMBERING_MAX_SEQUENCE} 的整数`);
  if (!/^[1-9]\d{0,18}$/.test(config.step) || BigInt(config.step) > BigInt(NUMBERING_MAX_SEQUENCE)) errors.push(`步长必须为 1 至 ${NUMBERING_MAX_SEQUENCE} 的整数`);
  if (!Number.isInteger(config.width) || config.width < 1 || config.width > 32) errors.push('流水位数必须为 1 至 32');
  try { new Intl.DateTimeFormat('en', { timeZone: config.timezone }).format(0); }
  catch { errors.push('请选择有效的 IANA 时区'); }
  let segments: NumberingSegment[];
  try { segments = parseNumberingTemplate(config.template); }
  catch (error) { return [...errors, error instanceof Error ? error.message : '编号模板无效']; }
  const sequences = segments.filter(segment => segment.kind === 'sequence');
  if (!sequences.length) errors.push('编号模板必须包含流水片段');
  const dates = segments.filter(segment => segment.kind === 'date').map(segment => segment.value);
  const hasYear = dates.some(token => token.includes('YY'));
  const hasMonth = dates.some(token => token.includes('MM'));
  const hasDay = dates.some(token => token.includes('DD'));
  if (config.resetPeriod !== 'never' && !hasYear) errors.push('按周期重置必须包含年份');
  if (['daily', 'monthly'].includes(config.resetPeriod) && !hasMonth) errors.push('按日或按月重置必须包含月份');
  if (config.resetPeriod === 'daily' && !hasDay) errors.push('按日重置必须包含日期');
  if (!sceneCode) return errors;
  let scene;
  try { scene = getNumberingScene(sceneCode); }
  catch (error) { return [...errors, error instanceof Error ? error.message : '编号业务无效']; }
  if (!scene.allowedScopes.includes(config.scope)) errors.push('当前业务不允许此流水范围');
  const params = segments.filter(segment => segment.kind === 'parameter').map(segment => segment.value);
  for (const parameter of params) {
    if (!(sceneCode === 'workflow.instance' && parseNumberingFormParameter(parameter) !== undefined) && !scene.parameters.some(item => item.key === parameter)) errors.push(`当前业务未声明参数：${parameter}`);
  }
  if (config.scope === 'department' && !params.includes('departmentId')) errors.push('按部门分配须包含 {departmentId}，防止部门间编号重复');
  if (config.scope === 'tenant' && scene.uniqueScope === 'global' && !params.includes('tenantId')) errors.push('全局唯一的租户流水须包含 {tenantId}');
  if (config.scope === 'owner' && scene.uniqueScope !== 'owner' && !params.includes('ownerKey')) errors.push('按业务对象分配须包含 {ownerKey}');
  const literal = segments.filter(segment => segment.kind === 'literal').map(segment => segment.value).join('');
  if (literal && !new RegExp(scene.characterPattern).test(literal)) errors.push('模板固定文本包含当前业务不支持的字符');
  const fixedLength = segments.reduce((sum, segment) => sum + (
    segment.kind === 'literal' ? segment.value.length : segment.kind === 'date' ? segment.value.length :
      segment.kind === 'sequence' ? Math.max(segment.width ?? config.width, config.start.length) : 1
  ), 0);
  if (fixedLength > scene.maxLength) errors.push(`编号长度不得超过 ${scene.maxLength} 位`);
  return errors;
}

function zonedDateParts(at: Date | string, timezone: string): Record<string, string> {
  // 字符串必须带偏移，避免预览浏览器与 API 主机时区不同造成周期偏移。
  if (typeof at === 'string' && !/(?:Z|[+-]\d\d:\d\d)$/.test(at)) throw new Error('编号时间必须包含时区偏移');
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) throw new Error('编号时间无效');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    YYYY: values.year!, YY: values.year!.slice(-2), MM: values.month!, DD: values.day!, HH: values.hour!, mm: values.minute!, ss: values.second!,
    YYYYMM: `${values.year}${values.month}`, YYYYMMDD: `${values.year}${values.month}${values.day}`,
    YYMMDD: `${values.year!.slice(-2)}${values.month}${values.day}`,
    HHmmss: `${values.hour}${values.minute}${values.second}`,
    YYYYMMDDHHmmss: `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`,
  };
}

export function resolveNumberingPeriodKey(config: NumberingConfig, at: Date | string): string {
  const parts = zonedDateParts(at, config.timezone);
  switch (config.resetPeriod) {
    case 'daily': return parts.YYYYMMDD!;
    case 'monthly': return parts.YYYYMM!;
    case 'yearly': return parts.YYYY!;
    case 'never': return 'all';
  }
}

export interface RenderBusinessNumberInput {
  sequence: string | bigint;
  at: Date | string;
  context?: Readonly<Record<string, string | number>>;
}

/** sequence 是数据库已分配的实际值，不再次应用起始值或步长。 */
export function renderBusinessNumber(config: NumberingConfig, input: RenderBusinessNumberInput, sceneCode?: string): string {
  const errors = validateNumberingConfig(config, sceneCode);
  if (errors.length) throw new Error(errors.join('；'));
  const sequence = String(input.sequence);
  if (!/^(?:0|[1-9]\d*)$/.test(sequence) || BigInt(sequence) > BigInt(NUMBERING_MAX_SEQUENCE)) throw new Error('流水值须为 bigint 范围内的非负整数');
  const dates = zonedDateParts(input.at, config.timezone);
  const value = parseNumberingTemplate(config.template).map(segment => {
    switch (segment.kind) {
      case 'literal': return segment.value;
      case 'date': return dates[segment.value];
      case 'sequence': return sequence.padStart(segment.width ?? config.width, '0');
      case 'parameter': {
        const parameter = input.context && Object.hasOwn(input.context, segment.value) ? input.context[segment.value] : undefined;
        if (parameter === undefined || parameter === null || String(parameter).length === 0) throw new Error(`缺少编号参数：${segment.value}`);
        if (typeof parameter === 'number' && !Number.isFinite(parameter)) throw new Error(`编号参数 ${segment.value} 必须为有限数值`);
        const text = String(parameter).replace(/[\s\p{Cc}]/gu, '');
        if (!text.length) throw new Error(`缺少编号参数：${segment.value}`);
        if (numericIdentityParameters.has(segment.value) && !/^(0|[1-9]\d*)$/.test(text)) throw new Error(`系统参数 ${segment.value} 必须为规范的非负整数`);
        if (text.length > 64 || /[{}]/.test(text)) throw new Error(`编号参数 ${segment.value} 不得超过 64 位或包含花括号`);
        return text;
      }
    }
  }).join('');
  if (sceneCode) {
    const scene = getNumberingScene(sceneCode);
    if (value.length > scene.maxLength) throw new Error(`生成编号超过业务允许的 ${scene.maxLength} 位`);
    if (!new RegExp(scene.characterPattern).test(value)) throw new Error('生成编号包含业务不允许的字符');
  }
  return value;
}

export function previewBusinessNumbers(config: NumberingConfig, input: { scene: string; at: Date | string; context?: Record<string, string>; count?: number }): { numbers: string[]; periodKey: string } {
  const count = input.count ?? 3;
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('预览数量必须为 1 至 10');
  const errors = validateNumberingConfig(config, input.scene);
  if (errors.length) throw new Error(errors.join('；'));
  return {
    numbers: Array.from({ length: count }, (_, index) => renderBusinessNumber(config, {
      sequence: BigInt(config.start) + BigInt(index) * BigInt(config.step), at: input.at, context: input.context,
    }, input.scene)),
    periodKey: resolveNumberingPeriodKey(config, input.at),
  };
}
