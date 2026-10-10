import type { Permission } from '@zenith/shared/core';
import { canonicalEntityDetailRoute, type CanonicalEntityRef, type CanonicalEntityType, type NumberingAllocation, type NumberingSceneCode } from '@zenith/shared/platform';

/** Only shipped exact-detail routes are eligible; callbacks recheck tenant/data access on the target page. */
const targets: Partial<Record<NumberingSceneCode, { type: CanonicalEntityType; permissions: readonly Permission[] }>> = {
  'workflow.instance': { type: 'workflow.instance', permissions: ['workflow:instance:list', 'workflow:instance:monitor', 'workflow:task:handle'] },
  // 请假详情契约为 authenticated，目标详情再校验当前用户是否有权查看此申请。
  'biz.leave': { type: 'biz.leave', permissions: [] },
  'payment.order': { type: 'payment.order', permissions: ['payment:order:list'] },
  'payment.deduction': { type: 'payment.order', permissions: ['payment:order:list'] },
  'payment.capture': { type: 'payment.order', permissions: ['payment:order:list'] },
  'payment.refund': { type: 'payment.refund', permissions: ['payment:refund:list'] },
  'payment.risk': { type: 'payment.risk-review', permissions: ['payment:risk:list'] },
  'payment.dispute': { type: 'payment.dispute', permissions: ['payment:dispute:list'] },
  'payment.sharing': { type: 'payment.sharing-order', permissions: ['payment:sharing:list'] },
  'payment.settlement': { type: 'payment.settlement-batch', permissions: ['payment:settlement:list'] },
};

export function numberingBusinessRef(
  allocation: Pick<NumberingAllocation, 'scene' | 'businessKey'>,
  hasPermission: (permission: Permission) => boolean,
): CanonicalEntityRef | undefined {
  const target = targets[allocation.scene];
  if (!target || !allocation.businessKey || (target.permissions.length > 0 && !target.permissions.some(hasPermission))) return undefined;
  const ref = { type: target.type, key: allocation.businessKey };
  return canonicalEntityDetailRoute(ref) ? ref : undefined;
}
