import type { MonitorAlertLevel, MonitorMetric } from '@zenith/shared';

export const MONITOR_METRIC_LABELS: Record<MonitorMetric, string> = {
  cpu: 'CPU 使用率',
  memory: '内存使用率',
  disk: '磁盘使用率',
  swap: 'Swap 使用率',
  load1: '系统负载(1m)',
  procCpu: '进程 CPU',
  heap: '堆内存使用率',
  loopLag: '事件循环延迟',
  qps: '请求 QPS',
  errorRate: 'HTTP 错误率',
  netRxBps: '网络下行',
  netTxBps: '网络上行',
  diskReadBps: '磁盘读取',
  diskWriteBps: '磁盘写入',
  workflowHealth: '流程引擎健康分',
  workflowBacklog: '流程引擎队列积压',
  workflowDeadLetter: '流程作业死信数',
  workflowFailureRate: '流程作业失败率',
  workflowStuckRunning: '流程作业卡死数',
};

export const MONITOR_METRIC_OPTIONS = (Object.keys(MONITOR_METRIC_LABELS) as MonitorMetric[])
  .map((value) => ({ value, label: MONITOR_METRIC_LABELS[value] }));

export const MONITOR_PERCENT_METRICS = new Set<MonitorMetric>([
  'cpu', 'memory', 'disk', 'swap', 'heap', 'procCpu', 'errorRate', 'workflowFailureRate',
]);

export const MONITOR_BYTES_METRICS = new Set<MonitorMetric>([
  'netRxBps', 'netTxBps', 'diskReadBps', 'diskWriteBps',
]);

export const MONITOR_ALERT_LEVEL_CONFIG: Record<
  MonitorAlertLevel,
  { label: string; color: 'blue' | 'amber' | 'red' }
> & Record<string, { label: string; color: 'blue' | 'amber' | 'red' }> = {
  info: { label: '提示', color: 'blue' },
  warning: { label: '警告', color: 'amber' },
  critical: { label: '严重', color: 'red' },
};
