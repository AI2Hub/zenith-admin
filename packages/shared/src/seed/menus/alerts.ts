import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 告警中心（15000 段） */
export const SEED_MENUS_ALERTS: Menu[] = [
  { id: 15000, parentId: 0, title: '告警中心', name: 'AlertCenter', icon: 'BellRing', type: 'directory', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 15030, parentId: 15000, title: '告警概览', name: 'AlertOverview', path: '/alerts/overview', component: 'alerts/overview/AlertOverviewPage', icon: 'LayoutDashboard', type: 'menu', sort: 0, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 15010, parentId: 15000, title: '告警规则', name: 'AlertRules', path: '/alerts/rules', component: 'alerts/rules/AlertRulesPage', icon: 'Siren', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 15020, parentId: 15000, title: '告警事件', name: 'AlertEvents', path: '/alerts/events', component: 'alerts/events/AlertEventsPage', icon: 'History', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
];
