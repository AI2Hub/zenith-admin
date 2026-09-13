import { OpenAPIHono } from '@hono/zod-openapi';
import { reportFolderContract } from '@zenith/shared/report';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import {
  createReportFolder,
  deleteReportFolder,
  getReportFolder,
  listReportFolderTree,
  moveReportFolder,
  updateReportFolder,
} from '../../services/report/report-folder.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const treeRoute = defineContractRoute(reportFolderContract.tree, {
  middleware: [authMiddleware, guard({ permission: 'report:folder:list' })],
  handler: async (c) => c.json(okBody(await listReportFolderTree(c.req.valid('query').resourceType)), 200),
});
const moveRoute = defineContractRoute(reportFolderContract.move, {
  middleware: [authMiddleware, guard({ permission: 'report:folder:update', audit: { module: '报表资源治理', description: '移动报表资源目录' } })],
  handler: async (c) => c.json(okBody(await moveReportFolder(c.req.valid('param').id, c.req.valid('json')), '移动成功'), 200),
});

mountCrud(router, reportFolderContract,
  { get: getReportFolder, create: createReportFolder, update: updateReportFolder, remove: deleteReportFolder },
  { permission: 'report:folder', label: '报表资源目录', module: '报表资源治理' },
  [treeRoute, moveRoute],
);

export default router;
