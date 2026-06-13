import { http, HttpResponse } from 'msw';
import type { PageStats, FeatureStats, HeatmapData, HeatmapPageListItem } from '@zenith/shared';

const MOCK_PAGES: PageStats = {
  totalVisits: 2847,
  items: [
    { pagePath: '/users', pageTitle: '用户管理', visits: 532, avgMs: 68400, medianMs: 45200, p90Ms: 142000 },
    { pagePath: '/roles', pageTitle: '角色管理', visits: 384, avgMs: 52100, medianMs: 38700, p90Ms: 118000 },
    { pagePath: '/workflow/definitions', pageTitle: '流程定义', visits: 298, avgMs: 124500, medianMs: 89300, p90Ms: 286000 },
    { pagePath: '/system/dicts', pageTitle: '字典管理', visits: 245, avgMs: 31200, medianMs: 22400, p90Ms: 72000 },
    { pagePath: '/departments', pageTitle: '部门管理', visits: 213, avgMs: 44700, medianMs: 33100, p90Ms: 98000 },
    { pagePath: '/', pageTitle: '首页', visits: 189, avgMs: 28900, medianMs: 19800, p90Ms: 65000 },
    { pagePath: '/system/menus', pageTitle: '菜单管理', visits: 156, avgMs: 87300, medianMs: 61200, p90Ms: 198000 },
    { pagePath: '/system/configs', pageTitle: '系统配置', visits: 134, avgMs: 39200, medianMs: 27600, p90Ms: 84000 },
    { pagePath: '/files', pageTitle: '文件管理', visits: 112, avgMs: 56400, medianMs: 41000, p90Ms: 124000 },
    { pagePath: '/cron-jobs', pageTitle: '定时任务', visits: 98, avgMs: 71200, medianMs: 52300, p90Ms: 158000 },
    { pagePath: '/system/operation-logs', pageTitle: '操作日志', visits: 87, avgMs: 48600, medianMs: 35100, p90Ms: 105000 },
    { pagePath: '/system/login-logs', pageTitle: '登录日志', visits: 76, avgMs: 35400, medianMs: 25200, p90Ms: 78000 },
  ],
};

const MOCK_FEATURES: FeatureStats = {
  totalEvents: 8924,
  items: [
    { pagePath: '/users', elementKey: 'search-btn', elementLabel: '查询', componentArea: 'search-toolbar', count: 1243 },
    { pagePath: '/users', elementKey: 'create-btn', elementLabel: '新增', componentArea: 'search-toolbar', count: 892 },
    { pagePath: '/users', elementKey: 'export-btn', elementLabel: '导出', componentArea: 'search-toolbar', count: 567 },
    { pagePath: '/roles', elementKey: 'search-btn', elementLabel: '查询', componentArea: 'search-toolbar', count: 498 },
    { pagePath: '/users', elementKey: 'edit-btn', elementLabel: '编辑', componentArea: 'table-actions', count: 423 },
    { pagePath: '/users', elementKey: 'reset-btn', elementLabel: '重置', componentArea: 'search-toolbar', count: 387 },
    { pagePath: '/workflow/definitions', elementKey: 'create-btn', elementLabel: '新建流程', componentArea: 'search-toolbar', count: 312 },
    { pagePath: '/roles', elementKey: 'create-btn', elementLabel: '新增', componentArea: 'search-toolbar', count: 287 },
    { pagePath: '/users', elementKey: 'delete-btn', elementLabel: '删除', componentArea: 'table-actions', count: 234 },
    { pagePath: '/departments', elementKey: 'create-btn', elementLabel: '新增', componentArea: 'search-toolbar', count: 198 },
    { pagePath: '/system/dicts', elementKey: 'search-btn', elementLabel: '查询', componentArea: 'search-toolbar', count: 187 },
    { pagePath: '/cron-jobs', elementKey: 'run-btn', elementLabel: '立即执行', componentArea: 'table-actions', count: 156 },
  ],
};

const MOCK_HEATMAP_PAGES: HeatmapPageListItem[] = [
  { pagePath: '/users', pageTitle: '用户管理', areas: ['search-toolbar', 'table'] },
  { pagePath: '/roles', pageTitle: '角色管理', areas: ['search-toolbar', 'table'] },
  { pagePath: '/workflow/definitions', pageTitle: '流程定义', areas: ['search-toolbar', 'table'] },
  { pagePath: '/departments', pageTitle: '部门管理', areas: ['search-toolbar', 'table'] },
];

function buildMockHeatmapData(pagePath: string, area: string): HeatmapData {
  // Generate pseudo-random but deterministic click points
  const points: { x: number; y: number; value: number }[] = [];
  const seed = pagePath.length + area.length;
  for (let i = 0; i < 120; i++) {
    // Cluster around a few hot spots
    const clusterX = [20, 45, 70, 85][(i + seed) % 4];
    const clusterY = [25, 55, 75][(i + seed) % 3];
    const x = clusterX + ((((i * 1237 + seed * 31) % 200) - 100) / 100) * 20;
    const y = clusterY + ((((i * 971 + seed * 17) % 200) - 100) / 100) * 18;
    points.push({
      x: Math.max(1, Math.min(99, x)),
      y: Math.max(1, Math.min(99, y)),
      value: Math.max(1, Math.floor(20 - i * 0.15)),
    });
  }
  return { pagePath, componentArea: area, points, total: 1847 };
}

export const analyticsHandlers = [
  http.post('/api/analytics/events', () => {
    return HttpResponse.json({ code: 0, message: '上报成功', data: null });
  }),

  http.get('/api/analytics/page-stats', () => {
    return HttpResponse.json({ code: 0, message: 'success', data: MOCK_PAGES });
  }),

  http.get('/api/analytics/feature-stats', () => {
    return HttpResponse.json({ code: 0, message: 'success', data: MOCK_FEATURES });
  }),

  http.get('/api/analytics/heatmap-pages', () => {
    return HttpResponse.json({ code: 0, message: 'success', data: { pages: MOCK_HEATMAP_PAGES } });
  }),

  http.get('/api/analytics/heatmap', ({ request }) => {
    const url = new URL(request.url);
    const pagePath = url.searchParams.get('pagePath') ?? '/users';
    const componentArea = url.searchParams.get('componentArea') ?? 'table';
    return HttpResponse.json({
      code: 0,
      message: 'success',
      data: buildMockHeatmapData(pagePath, componentArea),
    });
  }),
];
