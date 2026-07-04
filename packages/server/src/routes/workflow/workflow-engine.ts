import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { commonErrorResponses, ok, okPaginated, okBody, validationHook, PaginationQuery, IdParam, jsonContent, BatchIdsBody } from '../../lib/openapi-schemas';
import { WorkflowEngineActionResultDTO, WorkflowEngineActionFilterBody, WorkflowEngineActionPreviewDTO, WorkflowEngineHealthHistoryDTO, WorkflowEngineIntrospectionDTO, WorkflowJobDTO, WorkflowJobDetailDTO, WorkflowJobChainDTO, WorkflowTraceDiagnosticBundleDTO, WorkflowJobListQuery, WorkflowJobRetryBody, WorkflowJobSummaryItemDTO, WorkflowJobBatchResultDTO, WorkflowJobBatchRetryBody, WorkflowJobReplayBody, WorkflowJobReplayFilterBody, WorkflowJobReplayResultDTO, WorkflowJobReplayPreviewDTO, WorkflowJobFailureClusterQuery, WorkflowJobFailureClusterDTO, WorkflowJobRuntimeStatusDTO } from '../../lib/openapi-dtos';
import { getWorkflowEngineIntrospection } from '../../services/workflow/workflow-engine-introspection.service';
import { getWorkflowEngineHealthHistory, previewWorkflowEngineAction, runWorkflowEngineAction } from '../../services/workflow/workflow-engine-ops.service';
import { listWorkflowJobs, getWorkflowJobDetail, getWorkflowJobChain, retryWorkflowJob, skipWorkflowJob, getWorkflowJobsSummary, batchRetryWorkflowJobs, batchSkipWorkflowJobs, replayDeadJobs, previewReplayJobs, getJobFailureClusters, getWorkflowJobRuntimeStatus } from '../../services/workflow/workflow-jobs.service';
import { exportTraceDiagnosticBundle } from '../../services/workflow/workflow-diagnostics.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const ACTION_KEYS = ['replay-outbox', 'recover-delays', 'recover-subprocess', 'process-timeouts', 'recover-triggers', 'recover-webhooks'] as const;

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
    summary: '执行流程引擎运维恢复动作（支持按实例 / 入库时长 / 上限筛选）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '执行引擎运维恢复动作' } })] as const,
    request: {
      params: z.object({
        action: z.enum(ACTION_KEYS),
      }),
      body: { content: jsonContent(WorkflowEngineActionFilterBody), required: false },
    },
    responses: { ...commonErrorResponses, ...ok(WorkflowEngineActionResultDTO, '动作执行结果') },
  }),
  handler: async (c) => {
    const { action } = c.req.valid('param');
    const filter = c.req.valid('json') ?? {};
    return c.json(okBody(await runWorkflowEngineAction(action, filter)), 200);
  },
});

const actionPreviewRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/actions/{action}/preview',
    tags: ['WorkflowEngine'],
    summary: '运维恢复动作预览（按筛选统计将处理的作业 + 样本，不执行）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: {
      params: z.object({
        action: z.enum(ACTION_KEYS),
      }),
      body: { content: jsonContent(WorkflowEngineActionFilterBody), required: false },
    },
    responses: { ...commonErrorResponses, ...ok(WorkflowEngineActionPreviewDTO, '动作预览结果') },
  }),
  handler: async (c) => {
    const { action } = c.req.valid('param');
    const filter = c.req.valid('json') ?? {};
    return c.json(okBody(await previewWorkflowEngineAction(action, filter)), 200);
  },
});

const jobsListRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/jobs',
    tags: ['WorkflowEngine'],
    summary: '工作流作业账本列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: { query: PaginationQuery.merge(WorkflowJobListQuery) },
    responses: { ...commonErrorResponses, ...okPaginated(WorkflowJobDTO, '作业账本分页列表') },
  }),
  handler: async (c) => {
    const q = c.req.valid('query');
    return c.json(okBody(await listWorkflowJobs(q)), 200);
  },
});

const jobsSummaryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/jobs/summary',
    tags: ['WorkflowEngine'],
    summary: '按作业类型聚合的状态计数',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(WorkflowJobSummaryItemDTO), '各作业类型的状态计数') },
  }),
  handler: async (c) => {
    return c.json(okBody(await getWorkflowJobsSummary()), 200);
  },
});

const jobChainRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/jobs/chain/{traceId}',
    tags: ['WorkflowEngine'],
    summary: '工作流作业链路（同 traceId 的完整异步 fan-out，含跨实例/子流程串联）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: { params: z.object({ traceId: z.string().min(1).max(64) }) },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobChainDTO, '作业链路') },
  }),
  handler: async (c) => {
    const { traceId } = c.req.valid('param');
    return c.json(okBody(await getWorkflowJobChain(traceId)), 200);
  },
});

const jobChainBundleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/jobs/chain/{traceId}/diagnostic-bundle',
    tags: ['WorkflowEngine'],
    summary: 'traceId 诊断包（作业链路 + 涉及实例诊断聚合，供工单留档/离线分析）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: { params: z.object({ traceId: z.string().min(1).max(64) }) },
    responses: { ...commonErrorResponses, ...ok(WorkflowTraceDiagnosticBundleDTO, 'traceId 诊断包') },
  }),
  handler: async (c) => {
    const { traceId } = c.req.valid('param');
    return c.json(okBody(await exportTraceDiagnosticBundle(traceId)), 200);
  },
});

const jobDetailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/jobs/{id}',
    tags: ['WorkflowEngine'],
    summary: '工作流作业详情（含执行记录）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobDetailDTO, '作业详情') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await getWorkflowJobDetail(id)), 200);
  },
});

const jobRetryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/jobs/{id}/retry',
    tags: ['WorkflowEngine'],
    summary: '重试 / 改参重放作业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '重试工作流作业' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(WorkflowJobRetryBody), required: false } },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobDTO, '已重新入队') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return c.json(okBody(await retryWorkflowJob(id, body?.payload), '已重新入队'), 200);
  },
});

const jobSkipRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/jobs/{id}/skip',
    tags: ['WorkflowEngine'],
    summary: '跳过 / 取消作业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '跳过工作流作业' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobDTO, '已跳过') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await skipWorkflowJob(id), '已跳过'), 200);
  },
});

const jobsBatchRetryRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/jobs/batch-retry',
    tags: ['WorkflowEngine'],
    summary: '批量重试作业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '批量重试工作流作业' } })] as const,
    request: { body: { content: jsonContent(WorkflowJobBatchRetryBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobBatchResultDTO, '批量重试结果') },
  }),
  handler: async (c) => {
    const { ids, ratePerSecond } = c.req.valid('json');
    const result = await batchRetryWorkflowJobs(ids, { ratePerSecond });
    return c.json(okBody(result, `已重试 ${result.success} 项${result.skipped > 0 ? `，${result.skipped} 项状态不满足已跳过` : ''}`), 200);
  },
});

const jobsBatchSkipRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/jobs/batch-skip',
    tags: ['WorkflowEngine'],
    summary: '批量跳过作业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '批量跳过工作流作业' } })] as const,
    request: { body: { content: jsonContent(BatchIdsBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobBatchResultDTO, '批量跳过结果') },
  }),
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const result = await batchSkipWorkflowJobs(ids);
    return c.json(okBody(result, `已跳过 ${result.success} 项${result.skipped > 0 ? `，${result.skipped} 项状态不满足已跳过` : ''}`), 200);
  },
});

const jobsReplayDeadRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/jobs/replay-dead', tags: ['WorkflowEngine'], summary: '死信中心：按条件 + 限流重放死信作业',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:engine:operate', audit: { module: '流程引擎', description: '重放死信作业' } })] as const,
    request: { body: { content: jsonContent(WorkflowJobReplayBody), required: false } },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobReplayResultDTO, '重放结果') },
  }),
  handler: async (c) => {
    const b = c.req.valid('json') ?? {};
    const r = await replayDeadJobs(b);
    const more = r.matched > r.total ? `，剩余 ${r.matched - r.total} 条超单次上限未处理` : '';
    return c.json(okBody(r, `已按 ${r.ratePerSecond} 条/秒错峰重放 ${r.success}/${r.total}（匹配 ${r.matched} 条）${more}`), 200);
  },
});

const jobsReplayPreviewRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/jobs/replay-preview', tags: ['WorkflowEngine'], summary: '死信中心：条件重放预览（仅统计匹配数）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: { body: { content: jsonContent(WorkflowJobReplayFilterBody), required: false } },
    responses: { ...commonErrorResponses, ...ok(WorkflowJobReplayPreviewDTO, '预览结果') },
  }),
  handler: async (c) => c.json(okBody(await previewReplayJobs(c.req.valid('json') ?? {})), 200),
});

const jobFailureClustersRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/jobs/failure-clusters', tags: ['WorkflowEngine'], summary: '失败原因多维聚类',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    request: { query: WorkflowJobFailureClusterQuery },
    responses: { ...commonErrorResponses, ...ok(z.array(WorkflowJobFailureClusterDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getJobFailureClusters(c.req.valid('query').dimension)), 200),
});

const jobRuntimeStatusRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/jobs/runtime-status', tags: ['WorkflowEngine'], summary: '作业平台运行状态（worker 心跳 + 派生指标）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:instance:monitor' })] as const,
    responses: { ...commonErrorResponses, ...ok(WorkflowJobRuntimeStatusDTO, '运行状态') },
  }),
  handler: async (c) => c.json(okBody(await getWorkflowJobRuntimeStatus()), 200),
});

// 注意：静态段路由（/jobs/summary、/jobs/failure-clusters、/jobs/runtime-status 等）必须先于
// 参数化路由 /jobs/{id} 注册，否则 GET /jobs/runtime-status 会被 /jobs/{id} 捕获并按 id 校验失败。
router.openapiRoutes([introspectionRoute, healthHistoryRoute, actionRoute, actionPreviewRoute, jobsListRoute, jobsSummaryRoute, jobChainRoute, jobChainBundleRoute, jobsBatchRetryRoute, jobsBatchSkipRoute, jobsReplayDeadRoute, jobsReplayPreviewRoute, jobFailureClustersRoute, jobRuntimeStatusRoute, jobDetailRoute, jobRetryRoute, jobSkipRoute] as const);

export default router;
