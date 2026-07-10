import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  createReportFolderSchema,
  moveReportFolderSchema,
  reportResourceTypeSchema,
  updateReportFolderSchema,
} from '@zenith/shared';
import { ReportFolderDTO, ReportFolderTreeNodeDTO } from '../../lib/openapi-dtos';
import {
  commonErrorResponses,
  IdParam,
  jsonContent,
  ok,
  okBody,
  okMsg,
  validationHook,
} from '../../lib/openapi-schemas';
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

const router = new OpenAPIHono({ defaultHook: validationHook });

const treeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/tree', tags: ['报表资源目录'], summary: '资源目录树',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:folder:list' })] as const,
    request: { query: z.object({ resourceType: reportResourceTypeSchema.optional() }) },
    responses: { ...commonErrorResponses, ...ok(z.array(ReportFolderTreeNodeDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportFolderTree(c.req.valid('query').resourceType)), 200),
});

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['报表资源目录'], summary: '资源目录详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:folder:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportFolderDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportFolder(c.req.valid('param').id)), 200),
});

const createRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['报表资源目录'], summary: '创建资源目录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:folder:create', audit: { module: '报表资源治理', description: '创建报表资源目录' } })] as const,
    request: { body: { content: jsonContent(createReportFolderSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFolderDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportFolder(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['报表资源目录'], summary: '更新资源目录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:folder:update', audit: { module: '报表资源治理', description: '更新报表资源目录' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportFolderSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFolderDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportFolder(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const moveRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/move', tags: ['报表资源目录'], summary: '移动资源目录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:folder:update', audit: { module: '报表资源治理', description: '移动报表资源目录' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(moveReportFolderSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFolderDTO, '移动成功') },
  }),
  handler: async (c) => c.json(okBody(await moveReportFolder(c.req.valid('param').id, c.req.valid('json')), '移动成功'), 200),
});

const deleteRoute_ = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['报表资源目录'], summary: '删除资源目录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:folder:delete', audit: { module: '报表资源治理', description: '删除报表资源目录' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportFolder(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([treeRoute, getRoute, createRoute_, updateRoute_, moveRoute, deleteRoute_] as const);

export default router;
