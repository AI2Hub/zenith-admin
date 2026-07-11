/**
 * 工作流表单运行时求值（前后端共享的纯函数）。
 *
 * 放在 shared 是为了让「前端表单渲染 / 后端发起校验 / MSW Mock」对
 * 字段显隐、条件必填的判定保持**完全一致**，避免服务端校验与前端渲染产生偏差。
 * 求值语义与 packages/web WorkflowFormRenderer 的运行时行为一一对应。
 */
import type {
  WorkflowFieldPermission,
  WorkflowFieldVisibilityCondition,
  WorkflowFieldVisibilityRuleGroup,
  WorkflowFormField,
} from './types';

const toComparableStr = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
};

/** 表单值是否为空（undefined / null / 空串 / 空数组） */
export const isWorkflowFormValueEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** 单条显隐/必填条件求值 */
export function evalWorkflowFieldCondition(cond: WorkflowFieldVisibilityCondition, values: Record<string, unknown>): boolean {
  if (!cond?.field) return true;
  const left = values[cond.field];
  const right = cond.value;
  switch (cond.operator) {
    case 'eq': return left === right || toComparableStr(left) === toComparableStr(right);
    case 'neq': return left !== right && toComparableStr(left) !== toComparableStr(right);
    case 'in': {
      const arr = Array.isArray(right)
        ? right
        : (typeof right === 'string' ? right.split(',').map(s => s.trim()).filter(Boolean) : []);
      return arr.map(toComparableStr).includes(toComparableStr(left));
    }
    case 'contains': return Array.isArray(left) && left.map(toComparableStr).includes(toComparableStr(right));
    case 'gt': return Number(left) > Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lte': return Number(left) <= Number(right);
    case 'isEmpty': return isWorkflowFormValueEmpty(left);
    case 'notEmpty': return !isWorkflowFormValueEmpty(left);
    default: return true;
  }
}

/** 条件组求值（and/or；空组恒真） */
export function evalWorkflowFieldRuleGroup(group: WorkflowFieldVisibilityRuleGroup, values: Record<string, unknown>): boolean {
  const rules = group.rules?.filter(r => r?.field) ?? [];
  if (rules.length === 0) return true;
  return group.logic === 'or'
    ? rules.some(r => evalWorkflowFieldCondition(r, values))
    : rules.every(r => evalWorkflowFieldCondition(r, values));
}

/** 字段在当前表单值下是否可见（高级联动 > 默认隐藏 > 旧版单条件） */
export function isWorkflowFieldVisible(field: WorkflowFormField, values: Record<string, unknown>): boolean {
  if (field.visibilityRules && (field.visibilityRules.rules?.length ?? 0) > 0) {
    return evalWorkflowFieldRuleGroup(field.visibilityRules, values);
  }
  if (field.hidden) return false;
  if (field.visibilityCondition?.field) {
    return evalWorkflowFieldCondition(field.visibilityCondition, values);
  }
  return true;
}

/** 字段在当前表单值下是否必填（静态 required 或 requiredRules 条件满足） */
export function isWorkflowFieldRequired(field: WorkflowFormField, values: Record<string, unknown>): boolean {
  if (field.required) return true;
  if (field.requiredRules && (field.requiredRules.rules?.length ?? 0) > 0) {
    return evalWorkflowFieldRuleGroup(field.requiredRules, values);
  }
  return false;
}

/** 布局/展示类字段：无输入值，不参与必填校验 */
const NON_INPUT_FIELD_TYPES = new Set(['row', 'tabs', 'steps', 'group', 'divider', 'description']);

/**
 * 服务端发起必填校验：收集「可见、可编辑且必填但值为空」的字段 label。
 *
 * 与前端渲染语义一致的跳过规则：
 * - 布局/说明字段不参与；
 * - 不可见字段（显隐联动 / 默认隐藏 / 容器整体隐藏）不强制；
 * - `perms`（start 节点字段权限）标记 hidden/read 的字段由服务端剔除输入，不参与必填；
 * - formula/serialNumber 由系统生成，不参与；
 * - detail 明细校验自身必填（至少一行），子字段行级校验暂不下钻。
 */
export function collectMissingRequiredFields(
  fields: WorkflowFormField[],
  values: Record<string, unknown>,
  perms?: Record<string, WorkflowFieldPermission> | null,
): string[] {
  const missing: string[] = [];
  const walk = (list: WorkflowFormField[]): void => {
    for (const f of list) {
      if (!isWorkflowFieldVisible(f, values)) continue;
      const perm = perms?.[f.key];
      if (perm === 'hidden' || perm === 'read') continue;
      if (f.type === 'row' && f.columns) {
        for (const col of f.columns) walk(col.fields);
        continue;
      }
      if ((f.type === 'tabs' || f.type === 'steps') && f.panes) {
        for (const pane of f.panes) walk(pane.fields);
        continue;
      }
      if (f.type === 'group' && f.children) {
        walk(f.children);
        continue;
      }
      if (NON_INPUT_FIELD_TYPES.has(f.type)) continue;
      if (f.type === 'formula' || f.type === 'serialNumber') continue;
      if (f.readOnly) continue;
      if (isWorkflowFieldRequired(f, values) && isWorkflowFormValueEmpty(values[f.key])) {
        missing.push(f.label || f.key);
      }
    }
  };
  walk(fields);
  return missing;
}
