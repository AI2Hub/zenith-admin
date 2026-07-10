import { mapAsyncTask, registerTaskHandler, submitAsyncTask } from '../../lib/task-center';
import { ensureDatasetExists, refreshMaterialization } from './report-dataset.service';

const TASK_TYPE = 'report-dataset-materialize';

export function registerReportDatasetTaskHandlers(): void {
  registerTaskHandler({
    taskType: TASK_TYPE,
    title: '刷新报表物化快照',
    module: '报表中心',
    description: '异步刷新报表数据集物化快照，支持进度、幂等与取消。',
    allowConcurrent: false,
    async run(ctx) {
      const datasetId = Number(ctx.payload.datasetId);
      const snapshotId = Number(ctx.checkpoint?.snapshotId ?? 0) || undefined;
      await ctx.progress({ note: '开始刷新物化快照', checkpoint: { stage: 'start' } });
      const { cancelRequested } = await ctx.progress({ note: '正在执行数据集查询并写入快照', checkpoint: { stage: 'running' } });
      if (cancelRequested) return { cancelled: true, message: '任务已取消' };
      const result = await refreshMaterialization(datasetId, {
        strategy: ctx.payload.strategy === 'incremental' ? 'incremental' : 'full',
        keyField: typeof ctx.payload.keyField === 'string' ? ctx.payload.keyField : null,
        deltaWindowMinutes: typeof ctx.payload.deltaWindowMinutes === 'number' ? ctx.payload.deltaWindowMinutes : null,
        expiresAt: typeof ctx.payload.expiresAt === 'string' ? ctx.payload.expiresAt : null,
        snapshotId,
        isCancelRequested: ctx.isCancelRequested,
        onSnapshotStarted: async (startedSnapshotId) => {
          await ctx.progress({
            note: '已创建持久化快照记录',
            checkpoint: { stage: 'running', snapshotId: startedSnapshotId },
          });
        },
      });
      if (result.cancelled) {
        await ctx.progress({ note: '已取消，未写入物化快照', checkpoint: { stage: 'cancelled' } });
        return { cancelled: true, rows: result.rows, message: '任务已取消，未写入物化快照' };
      }
      await ctx.progress({ processed: result.rows, total: result.rows, note: `刷新完成，共 ${result.rows} 行`, checkpoint: { stage: 'done', rows: result.rows, snapshotId: result.snapshotId } });
      return { rows: result.rows, snapshotId: result.snapshotId, message: `物化刷新完成，共 ${result.rows} 行` };
    },
  });
}

export async function submitDatasetMaterializeTask(datasetId: number, input?: {
  strategy?: 'full' | 'incremental';
  keyField?: string | null;
  deltaWindowMinutes?: number | null;
  expiresAt?: string | null;
}) {
  const row = await ensureDatasetExists(datasetId);
  const materialize = (row.materialize ?? {}) as {
    strategy?: 'full' | 'incremental';
    keyField?: string | null;
    deltaWindowMinutes?: number | null;
    refreshedAtMs?: number | null;
  };
  const strategy = input?.strategy ?? materialize.strategy ?? 'full';
  const keyField = input?.keyField ?? materialize.keyField ?? null;
  if (strategy === 'incremental' && !keyField) {
    throw new Error('增量物化必须指定增量键');
  }
  return mapAsyncTask(await submitAsyncTask({
    taskType: TASK_TYPE,
    title: `刷新物化快照 · ${row.name}`,
    payload: {
      datasetId,
      strategy,
      keyField,
      deltaWindowMinutes: input?.deltaWindowMinutes ?? materialize.deltaWindowMinutes ?? null,
      expiresAt: input?.expiresAt ?? null,
    },
    idempotencyKey: `${TASK_TYPE}:${datasetId}:${strategy}:${keyField ?? ''}:${row.updatedAt.getTime()}:${materialize.refreshedAtMs ?? 0}`,
  }));
}
