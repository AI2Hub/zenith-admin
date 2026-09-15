import { eq, inArray, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../db/types';
import { managedFiles, userSignatures } from '../../db/schema';
import { buildWhere } from '../../lib/where-helpers';
import { releaseManagedFiles } from '../files/file-gc.service';

/** 调用方已锁定并授权待删账号/租户；在同一事务内清理其模板引用，不读取图片。 */
export async function releaseIdentitySignatures(executor: DbExecutor, where: SQL, deletingTenantId?: number): Promise<void> {
  const removed = await executor.delete(userSignatures).where(where).returning({ fileId: userSignatures.fileId });
  const fileIds = removed.map((row) => row.fileId);
  if (!fileIds.length) return;
  await releaseManagedFiles(executor, fileIds);
  if (deletingTenantId !== undefined) {
    // managed_files自身会随租户cascade删除；仅保留这些已释放的受控模板文件记录，交给统一GC删对象。
    await executor.update(managedFiles).set({ tenantId: null }).where(buildWhere(
      inArray(managedFiles.id, [...new Set(fileIds)]),
      eq(managedFiles.tenantId, deletingTenantId), eq(managedFiles.visibility, 'restricted'),
    ));
  }
}
