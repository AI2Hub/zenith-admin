import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import { requestReportMaterializationSchema } from '@zenith/shared';
import { AsyncTaskDTO, ReportMaterializationSnapshotDTO } from '../../lib/openapi-dtos';
import {
  commonErrorResponses,
  IdParam,
  jsonContent,
  ok,
  okBody,
  okMsg,
  okPaginated,
  PaginationQuery,
  validationHook,
} from '../../lib/openapi-schemas';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { submitDatasetMaterializeTask } from '../../services/report/report-dataset-tasks';
import {
  getCurrentMaterializationSnapshot,
  listMaterializationSnapshots,
  purgeDatasetMaterializationSnapshots,
  purgeMaterializationSnapshot,
} from '../../services/report/report-materialization.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表物化'];

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/datasets/{id}/snapshots', tags, summary: '物化快照历史',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:materialization:list' })] as const,
    request: { params: IdParam, query: PaginationQuery },
    responses: { ...commonErrorResponses, ...okPaginated(ReportMaterializationSnapshotDTO, 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    return c.json(okBody(await listMaterializationSnapshots(c.req.valid('param').id, query.page, query.pageSize)), 200);
  },
});

const currentRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/datasets/{id}/current', tags, summary: '当前物化快照',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:materialization:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportMaterializationSnapshotDTO.nullable(), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getCurrentMaterializationSnapshot(c.req.valid('param').id)), 200),
});

const refreshRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/datasets/{id}/refresh', tags, summary: '异步刷新物化快照',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:materialization:refresh', audit: { module: '报表物化', description: '刷新物化快照' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(requestReportMaterializationSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(AsyncTaskDTO, '任务已提交') },
  }),
  handler: async (c) => c.json(okBody(
    await submitDatasetMaterializeTask(c.req.valid('param').id, c.req.valid('json')),
    '任务已提交',
  ), 200),
});

const purgeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/snapshots/{id}', tags, summary: '清除物化快照',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:materialization:purge', audit: { module: '报表物化', description: '清除物化快照' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('清除成功') },
  }),
  handler: async (c) => {
    await purgeMaterializationSnapshot(c.req.valid('param').id);
    return c.json(okBody(null, '清除成功'), 200);
  },
});

const purgeDatasetRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/datasets/{id}/snapshots', tags, summary: '清除数据集历史快照',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:materialization:purge', audit: { module: '报表物化', description: '清除数据集历史快照' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('清除成功') },
  }),
  handler: async (c) => {
    const count = await purgeDatasetMaterializationSnapshots(c.req.valid('param').id);
    return c.json(okBody(null, `已清除 ${count} 个快照`), 200);
  },
});

router.openapiRoutes([listRoute, currentRoute, refreshRoute, purgeRoute, purgeDatasetRoute] as const);

export default router;
