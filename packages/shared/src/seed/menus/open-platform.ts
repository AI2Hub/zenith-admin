import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 开放平台（13000 段） */
export const SEED_MENUS_OPEN_PLATFORM: Menu[] = [
  { id: 13000, parentId: 0, title: '开放平台', name: 'OpenPlatform', icon: 'Boxes', type: 'directory', sort: 14, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13010, parentId: 13000, title: '应用管理', name: 'SystemOAuth2Apps', path: '/system/oauth2-apps', component: 'system/oauth2-apps/OAuth2AppsPage', icon: 'KeyRound', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13020, parentId: 13000, title: '我的应用', name: 'OpenMyApps', path: '/open-platform/my-apps', component: 'open-platform/my-apps/MyAppsPage', icon: 'AppWindow', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13030, parentId: 13000, title: 'API Scope', name: 'OpenApiScopes', path: '/open-platform/api-scopes', component: 'open-platform/api-scopes/ApiScopesPage', icon: 'KeySquare', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13040, parentId: 13000, title: '限流套餐', name: 'OpenRatePlans', path: '/open-platform/rate-plans', component: 'open-platform/rate-plans/RatePlansPage', icon: 'Gauge', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13050, parentId: 13000, title: '调用统计', name: 'OpenApiStats', path: '/open-platform/stats', component: 'open-platform/stats/OpenApiStatsPage', icon: 'LineChart', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13060, parentId: 13000, title: '签名验签', name: 'OpenSignature', path: '/open-platform/signature', component: 'open-platform/signature/SignatureToolPage', icon: 'FileSignature', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13070, parentId: 13000, title: 'Webhook 订阅', name: 'OpenWebhooks', path: '/open-platform/webhooks', component: 'open-platform/webhooks/WebhooksPage', icon: 'Webhook', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13080, parentId: 13000, title: 'SDK 示例', name: 'OpenSdk', path: '/open-platform/sdk', component: 'open-platform/sdk/SdkExamplesPage', icon: 'Code2', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 13090, parentId: 13000, title: 'API 调试台', name: 'OpenApiDebug', path: '/open-platform/debug', component: 'open-platform/debug/ApiDebugConsolePage', icon: 'Terminal', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── CMS 内容管理（14000 段）
];
