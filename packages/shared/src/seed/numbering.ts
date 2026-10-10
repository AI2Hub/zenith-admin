import type { NumberingBinding, NumberingRule, NumberingVersion } from '../platform/contracts/numbering';
import type { NumberingSceneCode } from '../platform/constants';
import { NUMBERING_SCENES } from '../platform/numbering-scenes';
import { SEED_DATE } from './_base';

const prefixes: Record<NumberingSceneCode, string> = {
  'workflow.instance': 'WF', 'biz.leave': 'QJ', 'payment.order': 'PO', 'payment.refund': 'RF',
  'payment.transfer': 'TR', 'payment.preauth': 'PA', 'payment.sharing': 'PS',
  'payment.settlement': 'ST', 'payment.risk': 'RK', 'payment.link': 'PL',
  'payment.contract': 'CT', 'payment.dispute': 'DP', 'payment.deduction': 'CD', 'payment.capture': 'PC',
};

/** 固定注册表顺序派生平台缺省规则；业务正式取号也只查询库内规则，不隐式创建。 */
export const SEED_NUMBERING_RULES: NumberingRule[] = NUMBERING_SCENES.map((scene, index) => ({
  id: index + 1, code: `${scene.code}.default`, name: `${scene.label}默认编号`, scene: scene.code,
  description: scene.description, tenantId: null, isBuiltin: true, status: 'enabled',
  draft: {
    template: `${prefixes[scene.code]}{YYYYMMDD}{SEQ:6}`, start: '1', step: '1', width: 6,
    resetPeriod: 'daily', timezone: 'Asia/Shanghai',
    scope: scene.uniqueScope === 'owner' ? 'owner' : scene.uniqueScope === 'tenant' ? 'tenant' : 'global',
  },
  revision: 1, currentVersion: 1, createdAt: SEED_DATE, updatedAt: SEED_DATE,
}));

export const SEED_NUMBERING_VERSIONS: NumberingVersion[] = SEED_NUMBERING_RULES.map(rule => ({
  id: rule.id, ruleId: rule.id, version: 1, config: rule.draft, createdBy: null, createdAt: SEED_DATE,
}));

export const SEED_NUMBERING_BINDINGS: NumberingBinding[] = SEED_NUMBERING_RULES.map(rule => ({
  id: rule.id, scene: rule.scene, ownerKey: '*', ruleId: rule.id, versionId: rule.id,
  ruleName: rule.name, version: 1,
  tenantId: null, parameterMapping: {}, createdAt: SEED_DATE, updatedAt: SEED_DATE,
}));
