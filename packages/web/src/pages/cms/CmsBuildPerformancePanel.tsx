import { Descriptions, Typography } from '@douyinfe/semi-ui';
import type { CmsBuildPerformance } from '@zenith/shared/cms';
import ConfigurableTable from '@/components/ConfigurableTable';
import { formatDurationMs } from '@/utils/format';

function targetLabel(key: string): string {
  const [scope, phase, id] = key.split('|');
  const label = scope === '~meta' ? '站点索引' : ({ '0': '首页', '1': '栏目', '2': '内容', '3': '标签', '4': '页面' }[phase] ?? '构建目标');
  return Number(id) > 0 ? `${label} #${Number(id)}` : label;
}

export default function CmsBuildPerformancePanel({ performance, peakMemoryMb }: Readonly<{ performance: CmsBuildPerformance; peakMemoryMb?: number }>) {
  return <details style={{ width: '100%' }}>
    <summary style={{ cursor: 'pointer', marginBottom: 12 }}>构建性能诊断</summary>
    <Descriptions align="left" data={[
      { key: '处理目标', value: `${performance.completedTargets} / ${performance.targetCount}` },
      { key: '并行上限', value: performance.concurrency },
      { key: '数据库查询', value: `${performance.queryCount} 次 · 累计 ${formatDurationMs(Math.round(performance.queryMs))}` },
      { key: '页面渲染', value: formatDurationMs(Math.round(performance.renderMs)) },
      { key: '文件处理', value: formatDurationMs(Math.round(performance.fileMs)) },
      { key: '检查点保存', value: `${performance.checkpointFlushes} 次 · ${formatDurationMs(Math.round(performance.checkpointMs))}` },
      { key: '共享读取复用', value: `${performance.sharedCacheHits} 次命中 / ${performance.sharedCacheMisses} 次首次读取` },
      { key: '进程峰值内存', value: peakMemoryMb == null ? '—' : `${peakMemoryMb} MB` },
    ]} />
    <Typography.Paragraph type="tertiary">分项为累计工作时长；查询包含连接等待与结果读取。并行任务与数据库、文件处理可能重叠，不与构建总耗时相加。以下显示最慢的构建目标。</Typography.Paragraph>
    <ConfigurableTable rowKey="key" pagination={false} size="small" dataSource={performance.slowestTargets} columns={[
      { title: '目标', dataIndex: 'key', minWidth: 150, render: (value: string) => targetLabel(value) },
      { title: '结果', dataIndex: 'outcome', width: 95, render: (value: CmsBuildPerformance['slowestTargets'][number]['outcome']) => ({ generated: '新生成', reused: '复用产物', resumed: '断点恢复', failed: '失败' }[value] ?? value) },
      { title: '耗时', dataIndex: 'elapsedMs', width: 110, render: (value: number) => formatDurationMs(Math.round(value)) },
      { title: '查询次数', dataIndex: 'queryCount', width: 100 },
      { title: '查询累计', dataIndex: 'queryMs', width: 110, render: (value: number) => formatDurationMs(Math.round(value)) },
      { title: '渲染累计', dataIndex: 'renderMs', width: 110, render: (value: number) => formatDurationMs(Math.round(value)) },
      { title: '文件处理', dataIndex: 'fileMs', width: 110, render: (value: number) => formatDurationMs(Math.round(value)) },
    ]} />
  </details>;
}
