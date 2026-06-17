import { mockDateTime } from '../utils/date';

const now = mockDateTime();

export interface MockMember {
  id: number;
  username: string | null;
  phone: string | null;
  email: string | null;
  nickname: string;
  avatar: string | null;
  gender: string | null;
  birthday: string | null;
  status: 'active' | 'inactive' | 'banned';
  levelId: number | null;
  levelName: string | null;
  growthValue: number;
  registerSource: string;
  registerIp: string | null;
  lastLoginAt: string | null;
  remark: string | null;
  hasPassword: boolean;
  pointBalance: number;
  walletBalance: number;
  createdAt: string;
  updatedAt: string;
  /** 仅 mock 登录校验用 */
  password: string;
}

export const mockMemberLevels = [
  { id: 1, name: '普通会员', level: 1, growthThreshold: 0, discount: 100, icon: null, benefits: ['基础积分权益'], description: '注册即可享受', sort: 1, status: 'enabled', memberCount: 86, createdAt: now, updatedAt: now },
  { id: 2, name: '银卡会员', level: 2, growthThreshold: 1000, discount: 98, icon: null, benefits: ['98 折优惠', '生日积分翻倍'], description: '成长值满 1000', sort: 2, status: 'enabled', memberCount: 32, createdAt: now, updatedAt: now },
  { id: 3, name: '金卡会员', level: 3, growthThreshold: 5000, discount: 95, icon: null, benefits: ['95 折优惠', '生日积分翻倍', '专属客服'], description: '成长值满 5000', sort: 3, status: 'enabled', memberCount: 12, createdAt: now, updatedAt: now },
  { id: 4, name: '钻石会员', level: 4, growthThreshold: 20000, discount: 90, icon: null, benefits: ['9 折优惠', '积分翻倍', '专属客服', '优先发货'], description: '成长值满 20000', sort: 4, status: 'enabled', memberCount: 3, createdAt: now, updatedAt: now },
];

export const mockMembers: MockMember[] = [
  { id: 1, username: null, phone: '13800138000', email: 'demo@member.dev', nickname: '演示会员', avatar: null, gender: 'male', birthday: null, status: 'active', levelId: 2, levelName: '银卡会员', growthValue: 1280, registerSource: 'seed', registerIp: '127.0.0.1', lastLoginAt: now, remark: null, hasPassword: true, pointBalance: 1280, walletBalance: 5000, createdAt: now, updatedAt: now, password: '123456' },
  { id: 2, username: 'alice', phone: '13900139001', email: 'alice@member.dev', nickname: 'Alice', avatar: null, gender: 'female', birthday: null, status: 'active', levelId: 1, levelName: '普通会员', growthValue: 320, registerSource: 'web', registerIp: '127.0.0.1', lastLoginAt: now, remark: null, hasPassword: true, pointBalance: 320, walletBalance: 0, createdAt: now, updatedAt: now, password: '123456' },
  { id: 3, username: null, phone: '13700137002', email: null, nickname: '老用户', avatar: null, gender: null, birthday: null, status: 'inactive', levelId: 3, levelName: '金卡会员', growthValue: 6200, registerSource: 'h5', registerIp: '127.0.0.1', lastLoginAt: null, remark: '长期未登录', hasPassword: false, pointBalance: 80, walletBalance: 19900, createdAt: now, updatedAt: now, password: '' },
];

export const mockMemberPointAccount = { memberId: 1, balance: 1280, frozen: 0, totalEarned: 1500, totalSpent: 220 };

export const mockMemberPointTxs = [
  { id: 1, memberId: 1, type: 'earn', amount: 100, balanceAfter: 100, bizType: 'register', bizId: null, remark: '注册赠送积分', memberName: '演示会员', createdAt: now },
  { id: 2, memberId: 1, type: 'earn', amount: 1200, balanceAfter: 1300, bizType: 'purchase', bizId: 'ORD202601', remark: '消费奖励', memberName: '演示会员', createdAt: now },
  { id: 3, memberId: 1, type: 'redeem', amount: -120, balanceAfter: 1180, bizType: 'redeem', bizId: null, remark: '积分兑换', memberName: '演示会员', createdAt: now },
  { id: 4, memberId: 1, type: 'adjust', amount: 100, balanceAfter: 1280, bizType: 'admin_adjust', bizId: null, remark: '客服补偿', memberName: '演示会员', createdAt: now },
];

export const mockMemberWallet = { memberId: 1, balance: 5000, frozen: 0, totalRecharge: 10000, totalConsume: 5000 };

export const mockMemberWalletTxs = [
  { id: 1, memberId: 1, type: 'recharge', amount: 10000, balanceAfter: 10000, bizType: 'member_recharge', bizId: 'PAY202601', remark: '账户充值', memberName: '演示会员', createdAt: now },
  { id: 2, memberId: 1, type: 'consume', amount: -5000, balanceAfter: 5000, bizType: 'order', bizId: 'ORD202602', remark: '订单支付', memberName: '演示会员', createdAt: now },
];

export const mockCoupons = [
  { id: 1, name: '新人满100减10', type: 'amount', faceValue: 1000, threshold: 10000, maxDiscount: null, totalQuantity: 1000, issuedQuantity: 156, perLimit: 1, validType: 'relative', validStart: null, validEnd: null, validDays: 30, status: 'active', description: '新人专享满减券', createdAt: now, updatedAt: now },
  { id: 2, name: '全场9折券', type: 'percent', faceValue: 90, threshold: 0, maxDiscount: 5000, totalQuantity: 500, issuedQuantity: 88, perLimit: 1, validType: 'relative', validStart: null, validEnd: null, validDays: 15, status: 'active', description: '限时 9 折，最高减 50 元', createdAt: now, updatedAt: now },
];

export const mockMemberCoupons = [
  { id: 1, couponId: 1, memberId: 1, code: 'SEEDCOUPON0001', status: 'unused', receivedAt: now, usedAt: null, expireAt: '2027-01-01 00:00:00', coupon: mockCoupons[0], memberName: '演示会员', createdAt: now },
  { id: 2, couponId: 2, memberId: 1, code: 'SEEDCOUPON0002', status: 'used', receivedAt: now, usedAt: now, expireAt: '2027-01-01 00:00:00', coupon: mockCoupons[1], memberName: '演示会员', createdAt: now },
];
