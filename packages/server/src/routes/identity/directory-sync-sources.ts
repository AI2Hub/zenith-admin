import { OpenAPIHono } from '@hono/zod-openapi';
import { directorySyncSourceContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listDirectorySyncSources,
  getDirectorySyncSource,
  createDirectorySyncSource,
  updateDirectorySyncSource,
  deleteDirectorySyncSource,
  testDirectorySyncSourceConnection,
  submitDirectorySyncTask,
} from '../../services/identity/directory-sync.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const testSourceRoute = defineContractRoute(directorySyncSourceContract.test, {
  middleware: [authMiddleware, guard({ permission: 'system:dirsync-source:test' })] as const,
  handler: async (c) => c.json(okBody(await testDirectorySyncSourceConnection(c.req.valid('param').id)), 200),
});

const previewSourceRoute = defineContractRoute(directorySyncSourceContract.preview, {
  middleware: [authMiddleware, guard({
    permission: 'system:dirsync-source:preview',
    audit: { description: '预览通讯录同步差异', module: '通讯录同步' },
  })] as const,
  handler: async (c) => {
    const task = await submitDirectorySyncTask(c.req.valid('param').id, true);
    return c.json(okBody(task, '预览任务已提交，请在同步记录中查看差异'), 200);
  },
});

const runSourceRoute = defineContractRoute(directorySyncSourceContract.run, {
  middleware: [authMiddleware, guard({
    permission: 'system:dirsync-source:run',
    audit: { description: '手动触发通讯录同步', module: '通讯录同步' },
  })] as const,
  handler: async (c) => {
    const task = await submitDirectorySyncTask(c.req.valid('param').id, false);
    return c.json(okBody(task, '同步任务已提交'), 200);
  },
});

mountCrud(router, directorySyncSourceContract,
  {
    list: listDirectorySyncSources,
    get: getDirectorySyncSource,
    create: createDirectorySyncSource,
    update: updateDirectorySyncSource,
    remove: deleteDirectorySyncSource,
  },
  {
    permission: { read: 'system:dirsync-source:list', create: 'system:dirsync-source:create', update: 'system:dirsync-source:edit', remove: 'system:dirsync-source:delete' },
    label: '通讯录同步源',
    module: '通讯录同步',
  },
  [testSourceRoute, previewSourceRoute, runSourceRoute],
);

export default router;
