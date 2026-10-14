import { getByPath } from '../core/json';
import { describeSettingsDefinition } from './definition';
import type { SettingsFieldChange } from './history-contracts';
import { stableSettingsSerialize } from './overrides';
import { settingsOverriddenPaths, type SettingsDoc } from './resolve';

type SettingsSnapshot = { effective: SettingsDoc; overrides: SettingsDoc };

/** 多重集合差：数组重复元素也按出现次数统计，不因 JSONB 对象键重排而误报。 */
function subtractItems(values: unknown[], excluded: unknown[]): unknown[] {
  const remaining = new Map<string, number>();
  for (const value of excluded) {
    const key = stableSettingsSerialize(value);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return values.filter((value) => {
    const key = stableSettingsSerialize(value);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

/**
 * 同时比较历史生效值与显式继承关系。即使值相同，从继承改成覆盖仍是一次可见变更。
 * 字段集合取自两个快照与保存时的定义，历史已删除字段仍可查看。
 */
export function diffSettingsSnapshots(
  from: SettingsSnapshot,
  to: SettingsSnapshot,
  definition: Record<string, unknown> = {},
  previousDefinition: Record<string, unknown> = {},
): SettingsFieldChange[] {
  const descriptors = new Map([
    ...describeSettingsDefinition(previousDefinition), ...describeSettingsDefinition(definition),
  ].map((field) => [field.path, field]));
  const beforePaths = new Set(settingsOverriddenPaths(from.overrides));
  const afterPaths = new Set(settingsOverriddenPaths(to.overrides));
  const paths = new Set([
    ...descriptors.keys(),
    ...settingsOverriddenPaths(from.effective),
    ...settingsOverriddenPaths(to.effective),
    ...beforePaths,
    ...afterPaths,
  ]);
  const changes: SettingsFieldChange[] = [];
  for (const path of [...paths].sort()) {
    const before = getByPath(from.effective, path);
    const after = getByPath(to.effective, path);
    const beforeOverridden = beforePaths.has(path);
    const afterOverridden = afterPaths.has(path);
    const valueChanged = stableSettingsSerialize(before) !== stableSettingsSerialize(after);
    const inheritanceChanged = beforeOverridden !== afterOverridden;
    if (!valueChanged && !inheritanceChanged) continue;
    const descriptor = descriptors.get(path);
    changes.push({
      path,
      title: descriptor?.title ?? path,
      type: descriptor?.type ?? (Array.isArray(after ?? before) ? 'array' : typeof (after ?? before)),
      before: before ?? null,
      after: after ?? null,
      beforeOverridden,
      afterOverridden,
      valueChanged,
      inheritanceChanged,
      added: Array.isArray(after) ? subtractItems(after, Array.isArray(before) ? before : []) : [],
      removed: Array.isArray(before) ? subtractItems(before, Array.isArray(after) ? after : []) : [],
    });
  }
  return changes;
}
