import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** IoT 设备管理（18000 段） */
export const SEED_MENUS_IOT: Menu[] = [
  { id: 18000, parentId: 0, title: 'IoT 设备', name: 'IotCenter', icon: 'Cpu', type: 'directory', sort: 18, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 总览仪表盘 ────────────────────────────────────────────────────────────
  { id: 18040, parentId: 18000, title: '总览', name: 'IotDashboard', path: '/iot/dashboard', component: 'iot/IotDashboardPage', icon: 'Gauge', type: 'menu', sort: 0, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 产品管理 ──────────────────────────────────────────────────────────────
  { id: 18010, parentId: 18000, title: '产品管理', name: 'IotProducts', path: '/iot/products', component: 'iot/IotProductsPage', icon: 'Package', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 设备管理 ──────────────────────────────────────────────────────────────
  { id: 18020, parentId: 18000, title: '设备管理', name: 'IotDevices', path: '/iot/devices', component: 'iot/IotDevicesPage', icon: 'HardDrive', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 告警中心 ──────────────────────────────────────────────────────────────
  { id: 18030, parentId: 18000, title: '告警中心', name: 'IotAlarms', path: '/iot/alarms', component: 'iot/IotAlarmsPage', icon: 'BellRing', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 固件升级 ──────────────────────────────────────────────────────────────
  { id: 18050, parentId: 18000, title: '固件升级', name: 'IotOta', path: '/iot/ota', component: 'iot/IotOtaPage', icon: 'CloudUpload', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 场景联动 ──────────────────────────────────────────────────────────────
  { id: 18060, parentId: 18000, title: '场景联动', name: 'IotAutomations', path: '/iot/automations', component: 'iot/IotAutomationsPage', icon: 'Workflow', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 数据流转 ──────────────────────────────────────────────────────────────
  { id: 18070, parentId: 18000, title: '数据流转', name: 'IotForwards', path: '/iot/forwards', component: 'iot/IotForwardsPage', icon: 'Share2', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 设备地图 ──────────────────────────────────────────────────────────────
  { id: 18080, parentId: 18000, title: '设备地图', name: 'IotMap', path: '/iot/map', component: 'iot/IotMapPage', icon: 'MapPin', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 计划任务 ──────────────────────────────────────────────────────────────
  { id: 18090, parentId: 18000, title: '计划任务', name: 'IotSchedules', path: '/iot/schedules', component: 'iot/IotSchedulesPage', icon: 'CalendarClock', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 动态注册 ──────────────────────────────────────────────────────────────
  { id: 18100, parentId: 18000, title: '动态注册', name: 'IotRegister', path: '/iot/register', component: 'iot/IotRegisterPage', icon: 'KeyRound', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
];
