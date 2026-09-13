import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 支付中心（8000 段） */
export const SEED_MENUS_PAYMENT: Menu[] = [
  { id: 8000, parentId: 0, title: '支付中心', name: 'PaymentCenter', icon: 'Wallet', type: 'directory', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8010, parentId: 8000, title: '支付渠道', name: 'PaymentChannels', path: '/payment/channels', component: 'payment/PaymentChannelsPage', icon: 'CreditCard', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8020, parentId: 8000, title: '支付订单', name: 'PaymentOrders', path: '/payment/orders', component: 'payment/PaymentOrdersPage', icon: 'ScrollText', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8030, parentId: 8000, title: '退款记录', name: 'PaymentRefunds', path: '/payment/refunds', component: 'payment/PaymentRefundsPage', icon: 'Undo2', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8040, parentId: 8000, title: '回调日志', name: 'PaymentLogs', path: '/payment/logs', component: 'payment/PaymentLogsPage', icon: 'FileClock', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8050, parentId: 8000, title: '对账中心', name: 'PaymentRecon', path: '/payment/recon', component: 'payment/PaymentReconPage', icon: 'FileCheck', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8060, parentId: 8000, title: '资金台账', name: 'PaymentLedger', path: '/payment/ledger', component: 'payment/PaymentLedgerPage', icon: 'BookOpen', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8070, parentId: 8000, title: 'Webhook 订阅', name: 'PaymentWebhooks', path: '/payment/webhooks', component: 'payment/PaymentWebhooksPage', icon: 'Webhook', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8080, parentId: 8000, title: '支付事件', name: 'PaymentEvents', path: '/payment/events', component: 'payment/PaymentEventsPage', icon: 'Activity', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8090, parentId: 8000, title: '费率管理', name: 'PaymentFeeRules', path: '/payment/fee-rules', component: 'payment/PaymentFeeRulesPage', icon: 'Percent', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8100, parentId: 8000, title: '结算管理', name: 'PaymentSettlements', path: '/payment/settlements', component: 'payment/PaymentSettlementsPage', icon: 'Banknote', type: 'menu', sort: 10, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8110, parentId: 8000, title: '分账管理', name: 'PaymentSharing', path: '/payment/sharing', component: 'payment/PaymentSharingPage', icon: 'Split', type: 'menu', sort: 11, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8120, parentId: 8000, title: '支付链接', name: 'PaymentLinks', path: '/payment/links', component: 'payment/PaymentLinksPage', icon: 'Link', type: 'menu', sort: 12, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8130, parentId: 8000, title: '风控中心', name: 'PaymentRiskRules', path: '/payment/risk-rules', component: 'payment/PaymentRiskRulesPage', icon: 'ShieldAlert', type: 'menu', sort: 13, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8140, parentId: 8000, title: '支付方式', name: 'PaymentMethods', path: '/payment/methods', component: 'payment/PaymentMethodsPage', icon: 'Wallet', type: 'menu', sort: 14, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8150, parentId: 8000, title: '财务报表', name: 'PaymentReports', path: '/payment/reports', component: 'payment/PaymentReportsPage', icon: 'ChartColumn', type: 'menu', sort: 15, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8160, parentId: 8000, title: '转账管理', name: 'PaymentTransfers', path: '/payment/transfers', component: 'payment/PaymentTransfersPage', icon: 'SendHorizontal', type: 'menu', sort: 16, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8170, parentId: 8000, title: '应用管理', name: 'PaymentApps', path: '/payment/apps', component: 'payment/PaymentAppsPage', icon: 'LayoutGrid', type: 'menu', sort: 17, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8180, parentId: 8000, title: '签约代扣', name: 'PaymentContracts', path: '/payment/contracts', component: 'payment/PaymentContractsPage', icon: 'Repeat', type: 'menu', sort: 18, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8190, parentId: 8000, title: '交易投诉', name: 'PaymentDisputes', path: '/payment/disputes', component: 'payment/PaymentDisputesPage', icon: 'MessageSquareWarning', type: 'menu', sort: 19, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 8200, parentId: 8000, title: '预授权', name: 'PaymentPreauths', path: '/payment/preauths', component: 'payment/PaymentPreauthsPage', icon: 'Snowflake', type: 'menu', sort: 20, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 会员中心（9000 段）
];
