import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 公众号管理（10000 段） */
export const SEED_MENUS_MP: Menu[] = [
  { id: 10000, parentId: 0, title: '公众号管理', name: 'MpCenter', icon: 'MessageCircle', type: 'directory', sort: 11, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10010, parentId: 10000, title: '公众号账号', name: 'MpAccounts', path: '/mp/accounts', component: 'mp/MpAccountsPage', icon: 'BadgeCheck', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10020, parentId: 10000, title: '标签管理', name: 'MpTags', path: '/mp/tags', component: 'mp/MpTagsPage', icon: 'Tags', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10030, parentId: 10000, title: '粉丝管理', name: 'MpFans', path: '/mp/fans', component: 'mp/MpFansPage', icon: 'Users', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10040, parentId: 10000, title: '消息管理', name: 'MpMessages', path: '/mp/messages', component: 'mp/MpMessagesPage', icon: 'MessagesSquare', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10050, parentId: 10000, title: '自动回复', name: 'MpAutoReplies', path: '/mp/auto-replies', component: 'mp/MpAutoRepliesPage', icon: 'Reply', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10060, parentId: 10000, title: '自定义菜单', name: 'MpMenu', path: '/mp/menu', component: 'mp/MpMenuPage', icon: 'Menu', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10070, parentId: 10000, title: '素材管理', name: 'MpMaterials', path: '/mp/materials', component: 'mp/MpMaterialsPage', icon: 'Image', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10080, parentId: 10000, title: '图文草稿', name: 'MpDrafts', path: '/mp/drafts', component: 'mp/MpDraftsPage', icon: 'Newspaper', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10090, parentId: 10000, title: '模板消息', name: 'MpTemplates', path: '/mp/template-messages', component: 'mp/MpTemplateMessagesPage', icon: 'MailCheck', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10100, parentId: 10000, title: '数据统计', name: 'MpStatistics', path: '/mp/statistics', component: 'mp/MpStatisticsPage', icon: 'BarChart3', type: 'menu', sort: 10, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10110, parentId: 10000, title: '群发消息', name: 'MpBroadcasts', path: '/mp/broadcasts', component: 'mp/MpBroadcastsPage', icon: 'Send', type: 'menu', sort: 11, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10120, parentId: 10000, title: '带参二维码', name: 'MpQrcodes', path: '/mp/qrcodes', component: 'mp/MpQrcodesPage', icon: 'QrCode', type: 'menu', sort: 12, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10130, parentId: 10000, title: '网页授权', name: 'MpOAuth', path: '/mp/oauth', component: 'mp/MpOAuthPage', icon: 'KeyRound', type: 'menu', sort: 13, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10140, parentId: 10000, title: '多客服', name: 'MpKfAccounts', path: '/mp/kf-accounts', component: 'mp/MpKfAccountsPage', icon: 'Headphones', type: 'menu', sort: 14, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10150, parentId: 10000, title: '会话工作台', name: 'MpKfSessions', path: '/mp/kf-sessions', component: 'mp/MpKfSessionsPage', icon: 'Headset', type: 'menu', sort: 15, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 10160, parentId: 10000, title: '个性化菜单', name: 'MpConditionalMenus', path: '/mp/conditional-menus', component: 'mp/MpConditionalMenusPage', icon: 'ListTree', type: 'menu', sort: 16, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 业务示例（11000 段）
];
