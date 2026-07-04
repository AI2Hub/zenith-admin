import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, okMsg, IdParam, okBody } from '../../lib/openapi-schemas';
import { createWorkflowDelegationSchema, updateWorkflowDelegationSchema } from '@zenith/shared';
import { WorkflowDelegationDTO } from '../../lib/openapi-dtos';
import {
  listWorkflowDelegations, createWorkflowDelegation, updateWorkflowDelegation, deleteWorkflowDelegation,
  getWorkflowDelegationBeforeAudit,
} from '../../services/workflow/workflow-delegations.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['WorkflowDelegations'], summary: '审批代理列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:delegation:view' })] as const,
    request: { query: PaginationQuery.extend({ principalId: z.coerce.number().int().optional(), scope: z.enum(['mine', 'all']).optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(WorkflowDelegationDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listWorkflowDelegations(c.req.valid('query'))), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['WorkflowDelegations'], summary: '新增审批代理',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:delegation:manage', audit: { description: '新增审批代理', module: '工作流管理' } })] as const,
    request: { body: { content: jsonContent(createWorkflowDelegationSchema), required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(WorkflowDelegationDTO, '已新增'),
      400: { content: jsonContent(z.object({})), description: '参数错误' },
    },
  }),
  handler: async (c) => c.json(okBody(await createWorkflowDelegation(c.req.valid('json')), '已新增'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['WorkflowDelegations'], summary: '更新审批代理',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:delegation:manage', audit: { description: '更新审批代理', module: '工作流管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateWorkflowDelegationSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowDelegationDTO, '已更新') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowDelegationBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateWorkflowDelegation(id, c.req.valid('json')), '已更新'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['WorkflowDelegations'], summary: '删除审批代理',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:delegation:manage', audit: { description: '删除审批代理', module: '工作流管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('已删除') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowDelegationBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteWorkflowDelegation(id);
    return c.json(okBody(null, '已删除'), 200);
  },
});

router.openapiRoutes([listRoute, createRouteDef, updateRoute, deleteRoute] as const);

export default router;
