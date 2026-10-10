import { NUMBERING_SCENE_CODES, type NumberingSceneCode, type NumberingScope } from './constants';

export interface NumberingSceneDefinition {
  code: NumberingSceneCode;
  label: string;
  description: string;
  uniqueNamespace: string;
  uniqueScope: 'global' | 'tenant' | 'owner';
  allowedScopes: readonly NumberingScope[];
  parameters: readonly { key: string; label: string; example: string }[];
  maxLength: number;
  characterPattern: string;
  tenantCustomizable: boolean;
}

const organizationalParameters = [
  { key: 'tenantId', label: '租户 ID', example: '1' },
  { key: 'ownerKey', label: '业务对象标识', example: '1' },
  { key: 'departmentId', label: '部门 ID', example: '2' },
  { key: 'departmentCode', label: '部门编码', example: 'HR' },
  { key: 'departmentName', label: '部门名称', example: '人事部' },
  { key: 'username', label: '发起人账号', example: 'admin' },
  { key: 'nickname', label: '发起人姓名', example: '管理员' },
  { key: 'tenantCode', label: '租户编码', example: 'zenith' },
  { key: 'categoryCode', label: '业务分类编码', example: 'QJ' },
] as const;
const paymentLabels = {
  'payment.order': '支付订单', 'payment.refund': '退款单', 'payment.transfer': '转账单',
  'payment.preauth': '预授权', 'payment.sharing': '分账单', 'payment.settlement': '结算单',
  'payment.risk': '风控事件', 'payment.link': '支付链接', 'payment.contract': '代扣签约',
  'payment.dispute': '交易投诉', 'payment.deduction': '周期扣款订单', 'payment.capture': '预授权转支付',
} as const;

/** 编号约束由业务代码声明，管理页面不能放宽支付渠道或唯一性约束。 */
export const NUMBERING_SCENES: readonly NumberingSceneDefinition[] = NUMBERING_SCENE_CODES.map(code => {
  if (code === 'workflow.instance') return {
    code, label: '流程实例', description: '首次正式发起时取号；草稿不取号，同一实例重提保留编号。',
    uniqueNamespace: code, uniqueScope: 'owner', allowedScopes: ['global', 'tenant', 'owner', 'department'],
    parameters: organizationalParameters, maxLength: 128, characterPattern: '^[^\\s{}\\u0000-\\u001F\\u007F]+$', tenantCustomizable: true,
  };
  if (code === 'biz.leave') return {
    code, label: '请假单', description: '创建业务单时取号；重新发起审批保留业务单号。',
    uniqueNamespace: code, uniqueScope: 'tenant', allowedScopes: ['global', 'tenant', 'department'],
    parameters: organizationalParameters.filter(item => item.key !== 'ownerKey'),
    maxLength: 64, characterPattern: '^[A-Za-z0-9_-]+$', tenantCustomizable: true,
  };
  return {
    code, label: paymentLabels[code], description: '受支付渠道协议约束，全局唯一；业务重试使用原编号。',
    uniqueNamespace: code === 'payment.deduction' || code === 'payment.capture' ? 'payment.order' : code,
    uniqueScope: 'global', allowedScopes: ['global'], parameters: [],
    maxLength: 32, characterPattern: '^[A-Za-z0-9]+$', tenantCustomizable: false,
  };
});

export const NUMBERING_SCENE_OPTIONS = NUMBERING_SCENES.map(({ code, label }) => ({ value: code, label }));

export function getNumberingScene(code: string): NumberingSceneDefinition {
  const scene = NUMBERING_SCENES.find(item => item.code === code);
  if (!scene) throw new Error(`未注册的编号业务：${code}`);
  return scene;
}
