import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 业务示例（11000 段） */
export const SEED_MENUS_BIZ: Menu[] = [
  { id: 11000, parentId: 0, title: '业务示例', name: 'BizDemo', icon: 'Briefcase', type: 'directory', sort: 12, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 11010, parentId: 11000, title: '请假管理', name: 'BizLeave', path: '/biz/leave', component: 'biz/leave/LeavePage', icon: 'CalendarClock', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 11020, parentId: 11000, title: '支付接入示例', name: 'BizPayDemo', path: '/biz/pay-demo', component: 'biz/pay-demo/PayDemoPage', icon: 'Wallet', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 11030, parentId: 11000, title: '异步任务示例', name: 'BizTaskDemo', path: '/biz/task-demo', component: 'biz/task-demo/TaskDemoPage', icon: 'ListTodo', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 报表中心（12000 段）
];
