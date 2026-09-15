import * as z from 'zod';
import { defineSettingsModule } from '../module-def';

/** SQL 监控采样设置。采样任务在 worker 中读取，作用域必须是平台级。 */
export const sqlMonitorSettingsSchema = z.object({
  enabled: z.boolean().default(true)
    .meta({ title: '启用 SQL 查询采样', description: '关闭后保留实时查询统计，停止分钟级历史采样' }),
  sampleIntervalMinutes: z.int().min(1).max(60).default(1)
    .meta({ title: '采样间隔（分钟）', description: '系统调度每分钟触发一次，实际采样按此间隔执行' }),
  sampleLimit: z.int().min(20).max(500).default(200)
    .meta({ title: '每次采样查询数', description: '按累计总耗时取 Top N；数值越大，历史明细写入量越高' }),
  queryTextMaxChars: z.int().min(200).max(2_000).default(2_000)
    .meta({ title: 'SQL 文本最大长度', description: '入库前再次截断已归一化 SQL，避免异常长语句占用采样存储' }),
}).meta({ id: 'Settings.SqlMonitor' });

export type SqlMonitorSettings = z.output<typeof sqlMonitorSettingsSchema>;

export const sqlMonitorSettingsModule = defineSettingsModule({
  schema: sqlMonitorSettingsSchema,
  title: 'SQL 监控',
  description: 'pg_stat_statements 查询统计采样与历史留存设置',
  scope: 'platform',
  readPermission: 'system:sql-monitor:list',
  writePermission: 'system:sql-monitor:manage',
  platformOnly: 'multi-tenant',
  sort: 56,
});
