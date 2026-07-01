/**
 * 业务编号 / 流水号渲染（前后端共享的纯逻辑）
 *
 * 设计要点：
 * - 本模块不依赖 dayjs，日期格式化通过 `formatDate` 回调注入，保持 `@zenith/shared` 零第三方依赖。
 * - 计数器仅存储「原始 1-based 序数」；序号起始值 / 步长在渲染期计算，避免改动计数器语义。
 * - `renderWorkflowSerialNo` 同时供后端生成、前端预览、MSW mock 复用，杜绝三端漂移。
 */
import type {
  WorkflowSerialNoConfig,
  WorkflowSerialDateFormat,
  WorkflowSerialResetPeriod,
} from './types';

/** 默认序号位数 */
export const WORKFLOW_SERIAL_DEFAULT_SEQ_LENGTH = 4;
/** 序号位数上下限 */
export const WORKFLOW_SERIAL_MIN_SEQ_LENGTH = 1;
export const WORKFLOW_SERIAL_MAX_SEQ_LENGTH = 18;

/** 日期格式化器：给定 dayjs 模板串，返回格式化后的文本 */
export type SerialDateFormatter = (pattern: string) => string;

/** 业务编号可用的动态变量（已解析为最终值） */
export interface WorkflowSerialVars {
  /** 发起人主部门名称 */
  dept?: string;
  /** 发起人主部门编码 */
  deptCode?: string;
  /** 发起人账号 */
  user?: string;
  /** 发起人昵称 */
  nickname?: string;
  /** 租户标识 */
  tenant?: string;
}

/** 渲染上下文 */
export interface WorkflowSerialRenderContext {
  /** 计数器返回的 1-based 序数（预览时传 1，得到起始值） */
  ordinal: number;
  /** 日期格式化器（注入 dayjs） */
  formatDate: SerialDateFormatter;
  /** 动态变量值 */
  vars?: WorkflowSerialVars;
  /** 表单数据，用于 `{FORM.字段}` 占位符 */
  formData?: Record<string, unknown>;
}

/** structured 模式的日期格式下拉选项 */
export const WORKFLOW_SERIAL_DATE_FORMAT_OPTIONS: Array<{
  value: WorkflowSerialDateFormat;
  label: string;
}> = [
  { value: 'none', label: '无' },
  { value: 'YYYYMMDD', label: '年月日（20260701）' },
  { value: 'YYYY-MM-DD', label: '年-月-日（2026-07-01）' },
  { value: 'YYYY/MM/DD', label: '年/月/日（2026/07/01）' },
  { value: 'YYYYMM', label: '年月（202607）' },
  { value: 'YYYY-MM', label: '年-月（2026-07）' },
  { value: 'YYYY', label: '年（2026）' },
  { value: 'YY', label: '两位年（26）' },
  { value: 'YYYYMMDDHHmmss', label: '年月日时分秒（20260701143005）' },
];

/** 序号重置周期下拉选项 */
export const WORKFLOW_SERIAL_RESET_PERIOD_OPTIONS: Array<{
  value: WorkflowSerialResetPeriod;
  label: string;
}> = [
  { value: 'never', label: '不重置' },
  { value: 'daily', label: '每天' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
];

/** template 模式可用占位符（用于设计器的可点击 token 面板与帮助文案） */
export interface WorkflowSerialTokenDoc {
  token: string;
  label: string;
  sample: string;
}

export const WORKFLOW_SERIAL_TOKENS: WorkflowSerialTokenDoc[] = [
  { token: '{YYYY}', label: '四位年', sample: '2026' },
  { token: '{YY}', label: '两位年', sample: '26' },
  { token: '{MM}', label: '月', sample: '07' },
  { token: '{DD}', label: '日', sample: '01' },
  { token: '{HH}', label: '时', sample: '14' },
  { token: '{mm}', label: '分', sample: '30' },
  { token: '{ss}', label: '秒', sample: '05' },
  { token: '{YYYYMMDD}', label: '年月日', sample: '20260701' },
  { token: '{YYYYMM}', label: '年月', sample: '202607' },
  { token: '{SEQ}', label: '序号（默认位数）', sample: '0001' },
  { token: '{SEQ:4}', label: '序号（指定位数）', sample: '0001' },
  { token: '{DEPT}', label: '发起人部门', sample: '研发部' },
  { token: '{DEPT_CODE}', label: '发起人部门编码', sample: 'RD' },
  { token: '{USER}', label: '发起人账号', sample: 'zhangsan' },
  { token: '{NICKNAME}', label: '发起人昵称', sample: '张三' },
  { token: '{TENANT}', label: '租户标识', sample: '1' },
];

/** 预览用的示例动态变量 */
export const WORKFLOW_SERIAL_SAMPLE_VARS: WorkflowSerialVars = {
  dept: '研发部',
  deptCode: 'RD',
  user: 'zhangsan',
  nickname: '张三',
  tenant: '1',
};

/** template 模式日期占位符 → dayjs 模板串 */
const DATE_TOKEN_PATTERNS: Record<string, string> = {
  YYYY: 'YYYY',
  YY: 'YY',
  MM: 'MM',
  DD: 'DD',
  HH: 'HH',
  mm: 'mm',
  ss: 'ss',
  YYYYMMDD: 'YYYYMMDD',
  YYYYMM: 'YYYYMM',
  YYMMDD: 'YYMMDD',
  YYYYMMDDHHmmss: 'YYYYMMDDHHmmss',
  HHmmss: 'HHmmss',
};

function clampSeqLength(length: number | undefined): number {
  const n = Number.isFinite(length) ? Number(length) : WORKFLOW_SERIAL_DEFAULT_SEQ_LENGTH;
  return Math.min(Math.max(n, WORKFLOW_SERIAL_MIN_SEQ_LENGTH), WORKFLOW_SERIAL_MAX_SEQ_LENGTH);
}

/** 去除动态变量值中的空白与控制字符，保证编号可安全拼接 */
function sanitizeVar(value: unknown): string {
  if (value === null || value === undefined) return '';
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\s\u0000-\u001f]/g, '').trim();
}

/**
 * 计算某次生成的最终展示序号：`seqStart + (ordinal - 1) * seqStep`。
 * `ordinal` 为计数器返回的 1-based 序数。
 */
export function computeSerialDisplayNumber(config: WorkflowSerialNoConfig, ordinal: number): number {
  const start = Number.isFinite(config.seqStart) ? Number(config.seqStart) : 1;
  const step = Number.isFinite(config.seqStep) && Number(config.seqStep) > 0 ? Number(config.seqStep) : 1;
  const n = Math.max(1, Math.trunc(ordinal));
  return start + (n - 1) * step;
}

/**
 * 计算计数器的周期键（与展示序号无关，仅决定何时归零）。
 */
export function resolveSerialPeriodKey(
  resetPeriod: WorkflowSerialResetPeriod | undefined,
  formatDate: SerialDateFormatter,
): string {
  switch (resetPeriod) {
    case 'daily':
      return formatDate('YYYYMMDD');
    case 'monthly':
      return formatDate('YYYYMM');
    case 'yearly':
      return formatDate('YYYY');
    default:
      return 'ALL';
  }
}

function renderStructured(config: WorkflowSerialNoConfig, ctx: WorkflowSerialRenderContext): string {
  const num = computeSerialDisplayNumber(config, ctx.ordinal);
  const seqStr = String(num).padStart(clampSeqLength(config.seqLength), '0');
  const datePart = config.dateFormat && config.dateFormat !== 'none' ? ctx.formatDate(config.dateFormat) : '';
  const separator = config.separator ?? '';
  const core = datePart ? `${datePart}${separator}${seqStr}` : seqStr;
  return `${config.prefix ?? ''}${core}${config.suffix ?? ''}`;
}

function renderTemplate(config: WorkflowSerialNoConfig, ctx: WorkflowSerialRenderContext): string {
  const num = computeSerialDisplayNumber(config, ctx.ordinal);
  const vars = ctx.vars ?? {};
  const template = config.template ?? '';
  return template.replace(/\{([^}]+)\}/g, (_match, raw: string) => {
    const token = raw.trim();

    // 序号：{SEQ} 或 {SEQ:n}
    const seqMatch = /^SEQ(?::(\d+))?$/i.exec(token);
    if (seqMatch) {
      const len = seqMatch[1] ? clampSeqLength(Number(seqMatch[1])) : clampSeqLength(config.seqLength);
      return String(num).padStart(len, '0');
    }

    // 日期
    if (Object.prototype.hasOwnProperty.call(DATE_TOKEN_PATTERNS, token)) {
      return ctx.formatDate(DATE_TOKEN_PATTERNS[token]);
    }

    // 表单字段：{FORM.字段}
    const formMatch = /^FORM\.(.+)$/i.exec(token);
    if (formMatch) {
      return sanitizeVar(ctx.formData?.[formMatch[1]]);
    }

    // 动态变量
    switch (token.toUpperCase()) {
      case 'DEPT':
        return sanitizeVar(vars.dept);
      case 'DEPT_CODE':
        return sanitizeVar(vars.deptCode);
      case 'USER':
        return sanitizeVar(vars.user);
      case 'NICKNAME':
        return sanitizeVar(vars.nickname);
      case 'TENANT':
        return sanitizeVar(vars.tenant);
      default:
        // 未知占位符：留空，避免非法字符进入业务编号
        return '';
    }
  });
}

/**
 * 根据配置与上下文渲染最终业务编号。
 * - `mode === 'template'` 走模板占位符替换；否则走结构化拼接。
 */
export function renderWorkflowSerialNo(
  config: WorkflowSerialNoConfig,
  ctx: WorkflowSerialRenderContext,
): string {
  return config.mode === 'template' ? renderTemplate(config, ctx) : renderStructured(config, ctx);
}
