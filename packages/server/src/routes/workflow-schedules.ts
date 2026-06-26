import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditBeforeData } from '../middleware/guard';
import { createWorkflowScheduleSchema, updateWorkflowScheduleSchema } from '@zenith/shared';
import { ErrorResponse, PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, okMsg, IdParam, okBody } from '../lib/openapi-schemas';
import { WorkflowScheduleDTO } from '../lib/openapi-dtos';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, runScheduleNow, getWorkflowScheduleBeforeAudit } from '../services/workflow-schedules.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['WorkflowSchedules'], summary: '定时发起规则列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:schedule:list' })] as const,
    request: { query: PaginationQuery.extend({ definitionId: z.coerce.number().int().optional(), status: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(WorkflowScheduleDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listSchedules(c.req.valid('query'))), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['WorkflowSchedules'], summary: '新建定时发起',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:schedule:create', audit: { description: '新建定时发起', module: '工作流管理' } })] as const,
    request: { body: { content: jsonContent(createWorkflowScheduleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowScheduleDTO, '已创建'), 400: { content: jsonContent(ErrorResponse), description: '参数错误' } },
  }),
  handler: async (c) => c.json(okBody(await createSchedule(c.req.valid('json')), '已创建'), 200),
});

const updateRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['WorkflowSchedules'], summary: '更新定时发起',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:schedule:edit', audit: { description: '更新定时发起', module: '工作流管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateWorkflowScheduleSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowScheduleDTO, '已更新'), 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowScheduleBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateSchedule(id, c.req.valid('json')), '已更新'), 200);
  },
});

const deleteRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['WorkflowSchedules'], summary: '删除定时发起',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:schedule:delete', audit: { description: '删除定时发起', module: '工作流管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('已删除'), 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowScheduleBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteSchedule(id);
    return c.json(okBody(null, '已删除'), 200);
  },
});

const runNowRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/run', tags: ['WorkflowSchedules'], summary: '立即执行一次',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:schedule:edit', audit: { description: '手动触发定时发起', module: '工作流管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(WorkflowScheduleDTO, '已执行'), 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowScheduleBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await runScheduleNow(id), '已触发一次执行'), 200);
  },
});

router.openapiRoutes([listRoute, createRouteDef, updateRouteDef, deleteRouteDef, runNowRoute] as const);

export default router;
