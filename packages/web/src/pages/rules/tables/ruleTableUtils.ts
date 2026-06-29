import type {
  RuleCaseResult,
  RuleDecisionInput,
  RuleDecisionOutput,
  RuleDecisionRow,
  RuleDecisionTable,
  RuleFieldType,
  RuleHitPolicy,
} from '@zenith/shared';

export interface RuleInspectionIssue {
  severity: 'error' | 'warning';
  message: string;
  ref?: string;
}

export interface RuleCellExplanation {
  inputKey: string;
  label: string;
  expr: string;
  value: unknown;
  condition: string;
  matched: boolean;
  detail: string;
}

export interface RuleRowExplanation {
  index: number;
  rowId: string;
  label?: string;
  matched: boolean;
  cells: RuleCellExplanation[];
}

export interface ValueDiff {
  key: string;
  expected: unknown;
  actual: unknown;
  equal: boolean;
}

interface DraftLike {
  inputs: RuleDecisionInput[];
  outputs: RuleDecisionOutput[];
  rules: RuleDecisionRow[];
}

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const SIMPLE_PATH_PATTERN = /^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/;

export function isWildcardCell(cell: string | undefined): boolean {
  const text = (cell ?? '').trim();
  return text === '' || text === '-' || text === '*';
}

export function coerceRuleValue(value: unknown, type: RuleFieldType): unknown {
  if (value === '' || value === undefined) return undefined;
  if (value === null) return null;
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }
  return String(value);
}

export function setScopeValue(scope: Record<string, unknown>, expr: string, value: unknown): void {
  const path = (expr ?? '').trim();
  if (!SIMPLE_PATH_PATTERN.test(path)) return;
  const keys = path.split('.');
  let node = scope;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      node[key] = value;
      return;
    }
    const next = node[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) node[key] = {};
    node = node[key] as Record<string, unknown>;
  });
}

export function getScopeValue(scope: Record<string, unknown>, expr: string): unknown {
  const path = (expr ?? '').trim();
  if (!SIMPLE_PATH_PATTERN.test(path)) return undefined;
  return path.split('.').reduce<unknown>((node, key) => {
    if (node == null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, scope);
}

export function formatRuleValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '空';
  if (typeof value === 'number' && Number.isNaN(value)) return '无效数字';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function buildTestScope(inputs: RuleDecisionInput[], values: Record<string, unknown>): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  inputs.forEach((input) => {
    const value = coerceRuleValue(values[input.key], input.type);
    setScopeValue(scope, input.expr, value);
  });
  return scope;
}

export function flattenInputValues(inputs: RuleDecisionInput[], scope: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(inputs.map((input) => [input.key, getScopeValue(scope, input.expr)]));
}

export function buildExpectedValues(outputs: RuleDecisionOutput[], values: Record<string, unknown>): Record<string, unknown> {
  const expected: Record<string, unknown> = {};
  outputs.forEach((output) => {
    expected[output.key] = coerceRuleValue(values[output.key], output.type);
  });
  return expected;
}

function sampleFromCondition(cell: string | undefined, type: RuleFieldType): unknown {
  const text = (cell ?? '').trim();
  if (isWildcardCell(text)) {
    if (type === 'number') return 1;
    if (type === 'boolean') return true;
    return 'sample';
  }
  if (type === 'number') {
    const comparison = text.match(/^(>=|<=|===|!==|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (comparison) {
      const target = Number(comparison[2]);
      if (comparison[1] === '>') return target + 1;
      if (comparison[1] === '>=') return target;
      if (comparison[1] === '<') return target - 1;
      if (comparison[1] === '<=') return target;
      if (comparison[1] === '!=' || comparison[1] === '!==') return target + 1;
      return target;
    }
    const range = text.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (range) return (Number(range[1]) + Number(range[2])) / 2;
    const n = Number(text);
    return Number.isFinite(n) ? n : 1;
  }
  if (type === 'boolean') {
    if (/!=\s*true|!==\s*true/i.test(text)) return false;
    if (/!=\s*false|!==\s*false/i.test(text)) return true;
    return text === 'true' || text === '1' || /==\s*true|===\s*true/i.test(text);
  }
  return text;
}

export function generateCaseFromRule(table: Pick<RuleDecisionTable, 'inputs' | 'outputs'>, row: RuleDecisionRow): { input: Record<string, unknown>; expected: Record<string, unknown> } {
  const input: Record<string, unknown> = {};
  table.inputs.forEach((col, index) => {
    setScopeValue(input, col.expr, sampleFromCondition(row.when?.[index], col.type));
  });
  const expected = Object.fromEntries(table.outputs.map((output) => [output.key, row.then?.[output.key] ?? output.default ?? null]));
  return { input, expected };
}

export function diffCaseOutputs(result: RuleCaseResult): ValueDiff[] {
  const keys = new Set([...Object.keys(result.expected ?? {}), ...Object.keys(result.actual ?? {})]);
  return [...keys].map((key) => {
    const expected = result.expected?.[key];
    const actual = result.actual?.[key];
    return { key, expected, actual, equal: JSON.stringify(expected) === JSON.stringify(actual) };
  });
}

function literalValid(value: unknown, type: RuleFieldType): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (type === 'number') return Number.isFinite(Number(value));
  if (type === 'boolean') return typeof value === 'boolean' || value === 'true' || value === 'false' || value === '1' || value === '0';
  return true;
}

function conditionValid(cell: string | undefined, type: RuleFieldType): boolean {
  const text = (cell ?? '').trim();
  if (isWildcardCell(text)) return true;
  if (type === 'number') {
    const comparison = text.match(/^(>=|<=|===|!==|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (comparison) return true;
    const range = text.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (range) return Number(range[1]) <= Number(range[2]);
    return Number.isFinite(Number(text));
  }
  if (type === 'boolean') {
    return /^(true|false|1|0)$/i.test(text) || /^(===|!==|==|!=)\s*(true|false|1|0)$/i.test(text);
  }
  return !/^(>=|<=|===|!==|==|!=|>|<)/.test(text);
}

export function inspectDecisionDraft(draft: DraftLike, hitPolicy: RuleHitPolicy): RuleInspectionIssue[] {
  const issues: RuleInspectionIssue[] = [];
  const inputKeys = new Map<string, number>();
  const outputKeys = new Map<string, number>();
  const rowIds = new Set<string>();
  const seenConditions = new Map<string, number>();

  if (draft.inputs.length === 0) issues.push({ severity: 'warning', message: '尚未配置输入列，发布前至少需要一个输入列' });
  if (draft.outputs.length === 0) issues.push({ severity: 'warning', message: '尚未配置输出列，发布前至少需要一个输出列' });
  if (draft.rules.length === 0) issues.push({ severity: 'warning', message: '尚未配置规则行，发布前至少需要一条规则' });

  draft.inputs.forEach((input, index) => {
    const ref = `输入列 ${index + 1}`;
    if (!input.key?.trim()) issues.push({ severity: 'error', message: `${ref} 缺少 key`, ref });
    else if (!KEY_PATTERN.test(input.key)) issues.push({ severity: 'error', message: `${ref} key 仅限字母开头的字母、数字、下划线或短横线`, ref });
    else if (inputKeys.has(input.key)) issues.push({ severity: 'error', message: `${ref} key 与输入列 ${inputKeys.get(input.key)! + 1} 重复`, ref });
    else inputKeys.set(input.key, index);
    if (!input.label?.trim()) issues.push({ severity: 'error', message: `${ref} 缺少名称`, ref });
    if (!input.expr?.trim()) issues.push({ severity: 'error', message: `${ref} 缺少取值表达式`, ref });
    else if (!SIMPLE_PATH_PATTERN.test(input.expr)) issues.push({ severity: 'warning', message: `${ref} 使用了复杂表达式，手动测试表单无法自动组装该输入`, ref });
  });

  draft.outputs.forEach((output, index) => {
    const ref = `输出列 ${index + 1}`;
    if (!output.key?.trim()) issues.push({ severity: 'error', message: `${ref} 缺少 key`, ref });
    else if (!KEY_PATTERN.test(output.key)) issues.push({ severity: 'error', message: `${ref} key 仅限字母开头的字母、数字、下划线或短横线`, ref });
    else if (outputKeys.has(output.key)) issues.push({ severity: 'error', message: `${ref} key 与输出列 ${outputKeys.get(output.key)! + 1} 重复`, ref });
    else outputKeys.set(output.key, index);
    if (!output.label?.trim()) issues.push({ severity: 'error', message: `${ref} 缺少名称`, ref });
    if (!literalValid(output.default, output.type)) issues.push({ severity: 'error', message: `${ref} 默认值与类型不匹配`, ref });
  });

  draft.rules.forEach((row, index) => {
    const ref = `规则行 ${index + 1}`;
    if (!row.id?.trim()) issues.push({ severity: 'error', message: `${ref} 缺少行 ID`, ref });
    else if (rowIds.has(row.id)) issues.push({ severity: 'error', message: `${ref} 行 ID 重复`, ref });
    else rowIds.add(row.id);

    if ((row.when ?? []).length !== draft.inputs.length) {
      issues.push({ severity: 'error', message: `${ref} 条件数量与输入列数量不一致`, ref });
    }
    draft.inputs.forEach((input, inputIndex) => {
      const cell = row.when?.[inputIndex] ?? '';
      if (!conditionValid(cell, input.type)) issues.push({ severity: 'error', message: `${ref} 的「${input.label}」条件格式与类型不匹配`, ref });
    });
    draft.outputs.forEach((output) => {
      if (!Object.prototype.hasOwnProperty.call(row.then ?? {}, output.key) || row.then?.[output.key] === '' || row.then?.[output.key] === undefined) {
        issues.push({ severity: 'warning', message: `${ref} 未填写输出「${output.label}」，命中时会使用默认值或 null`, ref });
      } else if (!literalValid(row.then?.[output.key], output.type)) {
        issues.push({ severity: 'error', message: `${ref} 的输出「${output.label}」与类型不匹配`, ref });
      }
    });

    const conditionKey = (row.when ?? []).join('\u0001');
    if (seenConditions.has(conditionKey)) {
      const previous = seenConditions.get(conditionKey)! + 1;
      issues.push({
        severity: hitPolicy === 'unique' ? 'error' : 'warning',
        message: `${ref} 与规则行 ${previous} 条件完全相同${hitPolicy === 'unique' ? '，唯一命中策略下会产生冲突' : ''}`,
        ref,
      });
    } else {
      seenConditions.set(conditionKey, index);
    }

    if (index < draft.rules.length - 1 && draft.inputs.length > 0 && draft.inputs.every((_, inputIndex) => isWildcardCell(row.when?.[inputIndex]))) {
      issues.push({ severity: 'warning', message: `${ref} 是全通配条件，后续规则可能无法命中`, ref });
    }
  });

  return issues;
}

function matchCondition(cellRaw: string | undefined, value: unknown, type: RuleFieldType): { matched: boolean; detail: string } {
  const cell = (cellRaw ?? '').trim();
  if (isWildcardCell(cell)) return { matched: true, detail: '通配' };

  if (type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return { matched: false, detail: `输入 ${formatRuleValue(value)}，不是有效数字` };
    const comparison = cell.match(/^(>=|<=|===|!==|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (comparison) {
      const target = Number(comparison[2]);
      const matched = comparison[1] === '>=' ? n >= target
        : comparison[1] === '<=' ? n <= target
          : comparison[1] === '>' ? n > target
            : comparison[1] === '<' ? n < target
              : comparison[1] === '!=' || comparison[1] === '!==' ? n !== target
                : n === target;
      return { matched, detail: `${n} ${comparison[1]} ${target}` };
    }
    const range = cell.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      return { matched: n >= min && n <= max, detail: `${n} 在 ${min}-${max}` };
    }
    const target = Number(cell);
    return { matched: n === target, detail: `${n} = ${target}` };
  }

  if (type === 'boolean') {
    const actual = coerceRuleValue(value, 'boolean');
    const comparison = cell.match(/^(===|!==|==|!=)\s*(true|false|1|0)$/i);
    const rawTarget = comparison ? comparison[2] : cell;
    const target = coerceRuleValue(rawTarget.toLowerCase(), 'boolean');
    const matched = comparison && (comparison[1] === '!=' || comparison[1] === '!==') ? actual !== target : actual === target;
    return { matched, detail: `${String(actual)} ${comparison?.[1] ?? '='} ${String(target)}` };
  }

  const actual = coerceRuleValue(value, 'string');
  return { matched: actual === cell, detail: `${formatRuleValue(actual)} = ${cell}` };
}

export function explainDecisionRows(table: Pick<RuleDecisionTable, 'inputs' | 'rules'>, scope: Record<string, unknown>): RuleRowExplanation[] {
  return table.rules.map((row, index) => {
    const cells = table.inputs.map((input, inputIndex) => {
      const value = getScopeValue(scope, input.expr);
      const result = matchCondition(row.when?.[inputIndex], value, input.type);
      return {
        inputKey: input.key,
        label: input.label,
        expr: input.expr,
        value,
        condition: row.when?.[inputIndex] ?? '',
        matched: result.matched,
        detail: result.detail,
      };
    });
    return { index, rowId: row.id, label: row.label, matched: cells.every((cell) => cell.matched), cells };
  });
}
