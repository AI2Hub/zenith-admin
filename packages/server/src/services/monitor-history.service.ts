/**
 * 监控指标持久化与历史查询。
 * - persistMetricSample：由 pg-boss 定时任务（默认每分钟）将采样器最新快照落库
 * - getMonitorHistory：按时间范围分桶聚合查询历史趋势
 * - cleanupMetricSamples：按保留天数清理旧数据
 * - getCurrentMetricSnapshot：返回当前各指标即时值（持久化 / 告警评估共用）
 */
import os from 'node:os';
import { sql, gte, lt, type AnyColumn } from 'drizzle-orm';
import { db } from '../db';
import { systemMetricSamples } from '../db/schema';
import { metricsSampler } from '../lib/metrics-sampler';
import { formatDateTime } from '../lib/datetime';
import logger from '../lib/logger';
import { getDisks, getLinuxMemInfo } from './monitor.service';
import { getLatestEngineHealthMetrics } from './workflow-engine-ops.service';
import type { MonitorMetric } from '@zenith/shared';

export type MetricSnapshot = Record<MonitorMetric, number>;

/**
 * 采集当前各监控指标的即时值。磁盘使用率取所有挂载点中的最大值（最易触发容量告警）。
 */
export async function getCurrentMetricSnapshot(): Promise<MetricSnapshot> {
  const sample = metricsSampler.getLatest();
  const diskIo = metricsSampler.getDiskIo();
  const [disks, memInfo, engineHealth] = await Promise.all([getDisks(), getLinuxMemInfo(), getLatestEngineHealthMetrics()]);
  const disk = disks && disks.length > 0 ? Math.max(...disks.map((d) => d.usagePercent)) : 0;
  const swap = memInfo?.swapUsagePercent ?? 0;
  const load1 = os.loadavg()[0] ?? 0;
  return {
    cpu: sample?.cpu ?? 0,
    memory: sample?.mem ?? 0,
    disk,
    swap,
    load1: Math.round(load1 * 100) / 100,
    procCpu: sample?.procCpu ?? 0,
    heap: sample?.heap ?? 0,
    loopLag: sample?.loopLagMean ?? 0,
    qps: sample?.qps ?? 0,
    errorRate: sample?.errorRate ?? 0,
    netRxBps: sample?.netRxBps ?? 0,
    netTxBps: sample?.netTxBps ?? 0,
    diskReadBps: diskIo.readBps,
    diskWriteBps: diskIo.writeBps,
    workflowHealth: engineHealth.workflowHealth,
    workflowBacklog: engineHealth.workflowBacklog,
  };
}

/** 落库一条指标采样（pg-boss 定时调用）。采样器未预热则跳过。 */
export async function persistMetricSample(): Promise<boolean> {
  if (!metricsSampler.getLatest()) return false;
  const s = await getCurrentMetricSnapshot();
  await db.insert(systemMetricSamples).values({
    cpu: s.cpu,
    memory: s.memory,
    disk: s.disk,
    swap: s.swap,
    load1: s.load1,
    procCpu: s.procCpu,
    heap: s.heap,
    loopLag: s.loopLag,
    qps: s.qps,
    errorRate: s.errorRate,
    netRxBps: s.netRxBps,
    netTxBps: s.netTxBps,
    diskReadBps: s.diskReadBps,
    diskWriteBps: s.diskWriteBps,
  });
  return true;
}

/** 删除保留期之前的采样数据，返回删除行数。 */
export async function cleanupMetricSamples(retentionDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(systemMetricSamples).where(lt(systemMetricSamples.sampledAt, cutoff)).returning({ id: systemMetricSamples.id });
  return deleted.length;
}

const RANGE_CONFIG: Record<string, { windowSec: number; bucketSec: number }> = {
  '1h': { windowSec: 3600, bucketSec: 60 },
  '6h': { windowSec: 6 * 3600, bucketSec: 120 },
  '24h': { windowSec: 24 * 3600, bucketSec: 300 },
  '7d': { windowSec: 7 * 24 * 3600, bucketSec: 1800 },
  '30d': { windowSec: 30 * 24 * 3600, bucketSec: 7200 },
};

/** 按时间范围分桶聚合查询历史趋势（每桶取平均值）。 */
export async function getMonitorHistory(range: string) {
  const cfg = RANGE_CONFIG[range] ?? RANGE_CONFIG['1h'];
  const since = new Date(Date.now() - cfg.windowSec * 1000);
  const bucketExpr = sql<number>`floor(extract(epoch from ${systemMetricSamples.sampledAt}) / ${cfg.bucketSec})`;
  const avg = (col: AnyColumn) => sql<number>`avg(${col})::float`;
  const rows = await db
    .select({
      bucket: bucketExpr,
      cpu: avg(systemMetricSamples.cpu),
      memory: avg(systemMetricSamples.memory),
      disk: avg(systemMetricSamples.disk),
      swap: avg(systemMetricSamples.swap),
      load1: avg(systemMetricSamples.load1),
      procCpu: avg(systemMetricSamples.procCpu),
      heap: avg(systemMetricSamples.heap),
      loopLag: avg(systemMetricSamples.loopLag),
      qps: avg(systemMetricSamples.qps),
      errorRate: avg(systemMetricSamples.errorRate),
      netRxBps: avg(systemMetricSamples.netRxBps),
      netTxBps: avg(systemMetricSamples.netTxBps),
      diskReadBps: avg(systemMetricSamples.diskReadBps),
      diskWriteBps: avg(systemMetricSamples.diskWriteBps),
    })
    .from(systemMetricSamples)
    .where(gte(systemMetricSamples.sampledAt, since))
    // 按输出第一列（分桶表达式）的序号分组/排序，避免 drizzle 在 SELECT 与 GROUP BY
    // 两处对同一列渲染限定符不一致触发 PG 42803。
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const round1 = (n: number) => Math.round(Number(n) * 10) / 10;
  const points = rows.map((r) => ({
    t: formatDateTime(new Date(Number(r.bucket) * cfg.bucketSec * 1000)),
    cpu: round1(r.cpu),
    memory: round1(r.memory),
    disk: round1(r.disk),
    swap: round1(r.swap),
    load1: Math.round(Number(r.load1) * 100) / 100,
    procCpu: round1(r.procCpu),
    heap: round1(r.heap),
    loopLag: Math.round(Number(r.loopLag) * 100) / 100,
    qps: Math.round(Number(r.qps) * 100) / 100,
    errorRate: round1(r.errorRate),
    netRxBps: Math.round(Number(r.netRxBps)),
    netTxBps: Math.round(Number(r.netTxBps)),
    diskReadBps: Math.round(Number(r.diskReadBps)),
    diskWriteBps: Math.round(Number(r.diskWriteBps)),
  }));

  if (points.length === 0) logger.debug?.('[monitor] history empty for range', { range });
  return { range, bucketSec: cfg.bucketSec, points };
}
