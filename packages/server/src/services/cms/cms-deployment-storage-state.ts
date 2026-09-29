import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { DbExecutor } from '../../db/types';
import { cmsDeploymentStorage } from '../../db/schema/cms-deployment-retention';

export async function assertCmsDeploymentStorageAvailable(executor: DbExecutor, deploymentId: number): Promise<void> {
  const [storage] = await executor.select({ state: cmsDeploymentStorage.storageState }).from(cmsDeploymentStorage).where(eq(cmsDeploymentStorage.deploymentId, deploymentId)).limit(1);
  if (storage && storage.state !== 'available') throw new HTTPException(409, { message: storage.state === 'purged' ? '该部署存储已回收，不能预览或回滚；请基于当前站点重新构建发布单' : '该部署正在回收，不能作为发布或恢复来源' });
}
