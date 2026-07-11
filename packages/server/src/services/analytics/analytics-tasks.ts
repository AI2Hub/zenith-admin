/**
 * 行为中心阶段 1：埋点每日聚合重建任务中心化（替代原同步 rollup/rebuild 接口）。
 * rebuildRollup 本身按 SQL GROUP BY 一次性处理全部租户，暂不支持按日期/维度切片续跑；
 * 此处仍需通过任务中心异步化执行，保证大范围重建不阻塞请求线程，并具备重复提交拦截 + 自动重试。
 */
import { registerTaskHandler } from '../../lib/task-center';
import { rebuildRollup } from './analytics-rollup.service';
import { materializeSegment } from './analytics-segments.service';

export const ANALYTICS_ROLLUP_REBUILD_TASK_TYPE = 'analytics-rollup-rebuild';
export const ANALYTICS_SEGMENT_MATERIALIZE_TASK_TYPE = 'analytics-segment-materialize';

export function registerAnalyticsTaskHandlers(): void {
  registerTaskHandler({
    taskType: ANALYTICS_ROLLUP_REBUILD_TASK_TYPE,
    title: '重建埋点每日聚合',
    module: '行为分析',
    description: '重新计算最近 N 天的每日聚合数据（总量 + 低基数维度分布），用于治理规则变更或数据修复后回填看板。',
    allowConcurrent: false,
    maxAttempts: 2,
    retryDelayMs: 30_000,
    async run(ctx) {
      const days = Math.min(Math.max(Number(ctx.payload.days ?? 30), 1), 730);
      await ctx.progress({ note: `开始重建近 ${days} 天聚合…`, checkpoint: { days } });
      const rebuiltRows = await rebuildRollup(days);
      await ctx.progress({ note: `已重建 ${rebuiltRows} 条聚合记录`, checkpoint: { days, rebuiltRows } });
      return { days, rebuiltRows, message: `已重建 ${rebuiltRows} 条聚合记录` };
    },
  });

  registerTaskHandler({
    taskType: ANALYTICS_SEGMENT_MATERIALIZE_TASK_TYPE,
    title: '重算用户分群成员',
    module: '行为分析',
    description: '根据分群规则（事件/属性条件 AND/OR 组合）重新计算并物化分群成员快照，用于圈选后立即可用的成员列表与人数展示。',
    allowConcurrent: false,
    maxAttempts: 2,
    retryDelayMs: 30_000,
    async run(ctx) {
      const segmentId = Number(ctx.payload.segmentId);
      if (!Number.isInteger(segmentId) || segmentId <= 0) throw new Error('无效的分群 ID');
      await ctx.progress({ note: `开始重算分群 #${segmentId} 成员…` });
      // materializeSegment 内部通过 ensureSegmentExists 在恢复后的创建者身份下重新校验 tenant 归属，
      // 防止分群归属发生变化（如租户迁移）后仍越权重算
      const { estimatedSize } = await materializeSegment(segmentId);
      const message = `重算完成，共 ${estimatedSize} 个成员`;
      await ctx.progress({ note: message });
      return { segmentId, estimatedSize, message };
    },
  });
}
