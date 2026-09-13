import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 报表中心（12000 段） */
export const SEED_MENUS_REPORT: Menu[] = [
  { id: 12000, parentId: 0, title: '报表中心', name: 'ReportCenter', icon: 'BarChart3', type: 'directory', sort: 13, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12010, parentId: 12000, title: '数据源', name: 'ReportDatasources', path: '/report/datasources', component: 'report/DataSourcesPage', icon: 'Database', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12020, parentId: 12000, title: '数据集', name: 'ReportDatasets', path: '/report/datasets', component: 'report/DatasetsPage', icon: 'Layers', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12030, parentId: 12000, title: '仪表盘', name: 'ReportDashboards', path: '/report/dashboards', component: 'report/DashboardListPage', icon: 'LayoutDashboard', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12040, parentId: 12000, title: '订阅推送', name: 'ReportSubscriptions', path: '/report/subscriptions', component: 'report/SubscriptionsPage', icon: 'BellRing', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12050, parentId: 12000, title: '打印报表', name: 'ReportPrintTemplates', path: '/report/print', component: 'report/PrintTemplatesPage', icon: 'Printer', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12060, parentId: 12000, title: '数据预警', name: 'ReportAlerts', path: '/report/alerts', component: 'report/AlertsPage', icon: 'BellPlus', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12070, parentId: 12000, title: '指标中心', name: 'ReportMetrics', path: '/report/metrics', component: 'report/MetricsPage', icon: 'Target', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12080, parentId: 12000, title: '数据质量', name: 'ReportQuality', path: '/report/quality', component: 'report/QualityPage', icon: 'BadgeCheck', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12090, parentId: 12000, title: '资源治理', name: 'ReportGovernance', path: '/report/governance', component: 'report/ReportGovernancePage', icon: 'ShieldCheck', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12120, parentId: 12000, title: '资产目录', name: 'ReportAssets', path: '/report/assets', component: 'report/AssetsPage', icon: 'Library', type: 'menu', sort: 10, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12140, parentId: 12000, title: '智能问数', name: 'ReportChatBi', path: '/report/chatbi', component: 'report/ChatBiPage', icon: 'MessageSquareText', type: 'menu', sort: 11, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12150, parentId: 12000, title: '填报模板', name: 'ReportFillTemplates', path: '/report/fill-templates', component: 'report/FillTemplatesPage', icon: 'ClipboardList', type: 'menu', sort: 12, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 12160, parentId: 12000, title: '填报记录', name: 'ReportFillRecords', path: '/report/fill-records', component: 'report/FillRecordsPage', icon: 'ListChecks', type: 'menu', sort: 13, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 开放平台（13000 段）
];
