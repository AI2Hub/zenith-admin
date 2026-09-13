import type { Context } from 'hono';
import { setAuditAfterData, setAuditBeforeData } from '../../../middleware/guard';
import { okBody } from '../../../lib/openapi-schemas';

export const compactAuditData = <T>(items: Array<T | null | undefined>) =>
  items.filter((item): item is T => item != null);

interface BatchOutcome { readonly success: boolean }

/**
 * 批量操作的统一收尾：按 id 列表取审计前 / 后快照（缺失项忽略），执行后以「成功 n 条，失败 m 条」返回
 * `{ succeeded, failed, results }`。`snapshot` 缺省时不记录审计快照（催办等不改状态的批量动作）。
 */
export async function runBatchWithAudit<TId, TResult extends BatchOutcome>(
  c: Context,
  ids: readonly TId[],
  run: () => Promise<TResult[]>,
  snapshot?: (id: TId) => Promise<unknown>,
) {
  const capture = async () => (snapshot ? compactAuditData(await Promise.all(ids.map((id) => snapshot(id)))) : []);
  const before = await capture();
  if (before.length > 0) setAuditBeforeData(c, before);
  const results = await run();
  const after = await capture();
  if (after.length > 0) setAuditAfterData(c, after);
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  return okBody({ succeeded, failed, results }, `成功 ${succeeded} 条，失败 ${failed} 条`);
}
