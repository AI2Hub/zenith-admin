import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { commonErrorResponses, ok, okBody, okPaginated, PaginationQuery, validationHook } from '../lib/openapi-schemas';
import { SystemSchedulerRunDTO, SystemSchedulerRunResultDTO, SystemSchedulerTaskDTO } from '../lib/openapi-dtos';
import { listSystemSchedulerRuns, listSystemSchedulerTasks, runSystemSchedulerTask } from '../services/system-scheduler.service';

const systemSchedulerRoutes = new OpenAPIHono({ defaultHook: validationHook });

const TaskNameParam = z.object({
  name: z.string().min(1).openapi({ param: { name: 'name', in: 'path' }, example: 'export-file-cleanup' }),
});

const TaskTypeQuery = z.enum(['recurring', 'queue']);
const TriggerTypeQuery = z.enum(['schedule', 'manual', 'queue']);
const RunStatusQuery = z.enum(['running', 'success', 'failed']);

const tasksRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/tasks', tags: ['SystemScheduler'], summary: '系统调度任务列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:scheduler:view' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(SystemSchedulerTaskDTO), '系统调度任务列表') },
  }),
  handler: async (c) => c.json(okBody(await listSystemSchedulerTasks()), 200),
});

const runsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/runs', tags: ['SystemScheduler'], summary: '系统调度运行日志',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:scheduler:view' })] as const,
    request: {
      query: PaginationQuery.extend({
        taskName: z.string().optional(),
        taskType: TaskTypeQuery.optional(),
        triggerType: TriggerTypeQuery.optional(),
        status: RunStatusQuery.optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...okPaginated(SystemSchedulerRunDTO, '系统调度运行日志') },
  }),
  handler: async (c) => c.json(okBody(await listSystemSchedulerRuns(c.req.valid('query'))), 200),
});

const runRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/tasks/{name}/run', tags: ['SystemScheduler'], summary: '手动执行系统周期任务',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:scheduler:run', audit: { module: '系统调度', description: '手动执行系统周期任务' } })] as const,
    request: { params: TaskNameParam },
    responses: { ...commonErrorResponses, ...ok(SystemSchedulerRunResultDTO, '执行结果') },
  }),
  handler: async (c) => c.json(okBody(await runSystemSchedulerTask(c.req.valid('param').name), '执行完成'), 200),
});

systemSchedulerRoutes.openapiRoutes([tasksRoute, runsRoute, runRoute] as const);

export default systemSchedulerRoutes;
