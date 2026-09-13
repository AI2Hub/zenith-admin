import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 会员中心（9000 段） */
export const SEED_MENUS_MEMBER: Menu[] = [
  { id: 9000, parentId: 0, title: '会员中心', name: 'MemberCenter', icon: 'Crown', type: 'directory', sort: 10, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9010, parentId: 9000, title: '会员看板', name: 'MemberDashboard', path: '/member/dashboard', component: 'member/MemberDashboardPage', icon: 'LayoutDashboard', type: 'menu', sort: 0, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9020, parentId: 9000, title: '会员管理', name: 'MemberList', path: '/member/members', component: 'member/MembersPage', icon: 'UserRound', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9030, parentId: 9000, title: '会员等级', name: 'MemberLevels', path: '/member/levels', component: 'member/MemberLevelsPage', icon: 'Medal', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9040, parentId: 9000, title: '积分管理', name: 'MemberPoints', path: '/member/points', component: 'member/MemberPointsPage', icon: 'Coins', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9050, parentId: 9000, title: '钱包管理', name: 'MemberWallets', path: '/member/wallets', component: 'member/MemberWalletPage', icon: 'WalletCards', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9060, parentId: 9000, title: '优惠券', name: 'Coupons', path: '/member/coupons', component: 'member/CouponsPage', icon: 'Ticket', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9070, parentId: 9000, title: '领券记录', name: 'CouponRecords', path: '/member/coupon-records', component: 'member/CouponRecordsPage', icon: 'TicketCheck', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9080, parentId: 9000, title: '会员签到', name: 'MemberCheckin', icon: 'CalendarCheck', type: 'directory', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9090, parentId: 9080, title: '签到配置', name: 'CheckinRules', path: '/member/checkin-rules', component: 'member/CheckinRulesPage', icon: 'Settings', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9100, parentId: 9080, title: '签到记录', name: 'CheckinLogs', path: '/member/checkin-logs', component: 'member/CheckinLogsPage', icon: 'CalendarDays', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9110, parentId: 9080, title: '里程碑配置', name: 'CheckinMilestones', path: '/member/checkin-milestones', component: 'member/CheckinMilestonesPage', icon: 'Trophy', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9120, parentId: 9000, title: '登录日志', name: 'MemberLoginLogs', path: '/member/login-logs', component: 'member/MemberLoginLogsPage', icon: 'LogIn', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 9130, parentId: 9000, title: '充值记录', name: 'MemberRecharges', path: '/member/recharges', component: 'member/MemberRechargesPage', icon: 'CreditCard', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 公众号管理（10000 段）
];
