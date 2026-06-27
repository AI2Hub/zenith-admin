import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { commonErrorResponses, ok, okBody, validationHook } from '../lib/openapi-schemas';
import { WorkflowEngineActionResultDTO, WorkflowEngineHealthHistoryDTO, WorkflowEngineIntrospectionDTO } from '../lib/openapi-dtos';
import { getWorkflowEngineIntrospection } from '../services/workflow-engine-introspection.service';
import { getWorkflowEngineHealthHistory, runWorkflowEngineAction } from '../services/workflow-engine-ops.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const ACTION_KEYS = ['replay-outbox', 'recover-delays', 'recover-subprocess', 'process-timeouts', 'recover-triggers'] as const;

const introspectionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/introspection',
    tags: ['WorkflowEngine'],
    summary: '流程引擎内部状态内省',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: {
      query: z.object({
        thresholdMinutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...ok(WorkflowEngineIntrospectionDTO, '流程引擎内部状态快照') },
  }),
  handler: async (c) => {
    const { thresholdMinutes } = c.req.valid('query');
    return c.json(okBody(await getWorkflowEngineIntrospection(thresholdMinutes ?? 30)), 200);
  },
});

const healthHistoryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/health-history',
    tags: ['WorkflowEngine'],
    summary: '流程引擎健康趋势历史',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: {
      query: z.object({
        hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
      }),
    },
    responses: { ...commonErrorResponses, ...ok(WorkflowEngineHealthHistoryDTO, '流程引擎健康趋势历史') },
  }),
  handler: async (c) => {
    const { hours } = c.req.valid('query');
    return c.json(okBody(await getWorkflowEngineHealthHistory(hours ?? 24)), 200);
  },
});

const actionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/actions/{action}',
    tags: ['WorkflowEngine'],
    summary: '执行流程引擎运维恢复动作',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '执行引擎运维恢复动作' } })] as const,
    request: {
      params: z.object({
        action: z.enum(ACTION_KEYS),
      }),
    },
    responses: { ...commonErrorResponses, ...ok(WorkflowEngineActionResultDTO, '动作执行结果') },
  }),
  handler: async (c) => {
    const { action } = c.req.valid('param');
    return c.json(okBody(await runWorkflowEngineAction(action)), 200);
  },
});

router.openapiRoutes([introspectionRoute, healthHistoryRoute, actionRoute] as const);

export default router;
