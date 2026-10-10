import { expect, it } from 'vitest';
import { previewBusinessNumbers, validateNumberingConfig } from '../platform/numbering';
import { SEED_NUMBERING_BINDINGS, SEED_NUMBERING_RULES, SEED_NUMBERING_VERSIONS } from './numbering';

it('内置规则满足各场景约束且业务绑定引用实际发布版本', () => {
  for (const rule of SEED_NUMBERING_RULES) {
    expect(validateNumberingConfig(rule.draft, rule.scene)).toEqual([]);
    expect(previewBusinessNumbers(rule.draft, { scene: rule.scene, at: '2026-10-11T02:00:00Z' }).numbers).toHaveLength(3);
    const binding = SEED_NUMBERING_BINDINGS.find(item => item.scene === rule.scene)!;
    const version = SEED_NUMBERING_VERSIONS.find(item => item.id === binding.versionId)!;
    expect(version.ruleId).toBe(rule.id);
    expect(version.version).toBe(rule.currentVersion);
  }
});
