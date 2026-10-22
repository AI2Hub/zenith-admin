import { dashboardContract } from '@zenith/shared/analytics';
import { mock } from '@/mocks/utils/contract';
import { mockDate } from '@/mocks/utils/date';

function pastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return mockDate(d);
  });
}

const dates = pastDates(7);

const MODULES = ['用户管理', '角色管理', '菜单管理', '字典管理', '系统配置'];

export const dashboardHandlers = [
  mock(dashboardContract.stats, ({ ok }) => ok({
    totalUsers: 12,
    onlineUsers: 3,
    todayLogins: 8,
    todayOperations: 45,
  }, 'success')),

  mock(dashboardContract.charts, ({ ok }) => {
    const loginTrend = dates.map((date) => ({
      date,
      successCount: Math.floor(Math.random() * 12) + 2,
      failCount: Math.floor(Math.random() * 3),
    }));

    // 每天一份模块分布，供首页日期条本地切换
    const operationDistribution = dates.flatMap((date) =>
      MODULES.map((module) => ({ date, module, count: Math.floor(Math.random() * 18) + 1 })),
    );

    return ok({ loginTrend, operationDistribution }, 'success');
  }),
];
