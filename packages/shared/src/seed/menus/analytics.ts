import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 数据分析（7000 段） */
export const SEED_MENUS_ANALYTICS: Menu[] = [
  { id: 7000, parentId: 0, title: '数据分析', name: 'Analytics', icon: 'BarChart2', type: 'directory', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 7010, parentId: 7000, title: '行为分析', name: 'AnalyticsBehavior', path: '/analytics/behavior', component: 'analytics/AnalyticsPage', icon: 'Activity', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 7020, parentId: 7000, title: '数据管理', name: 'AnalyticsData', path: '/analytics/data', component: 'analytics/AnalyticsDataPage', icon: 'Database', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 7030, parentId: 7000, title: '错误监控', name: 'FrontendErrors', path: '/analytics/errors', component: 'analytics/FrontendErrorsPage', icon: 'AlertCircle', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 7040, parentId: 7000, title: '会话回放', name: 'SessionReplays', path: '/analytics/replays', component: 'analytics/SessionReplaysPage', icon: 'Video', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 支付中心（8000 段）
];
