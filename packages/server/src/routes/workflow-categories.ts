import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditBeforeData } from '../middleware/guard';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../lib/openapi-schemas';
import { WorkflowCategoryDTO } from '../lib/openapi-dtos';
import {
  listWorkflowCategories,
  listAllWorkflowCategories,
  getWorkflowCategory,
  createWorkflowCategory,
  updateWorkflowCategory,
  deleteWorkflowCategory,
  getWorkflowCategoryBeforeAudit,
} from '../services/workflow-categories.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const createSchema = z.object({
  name: z.string().min(1).max(64),
  code: z.string().max(64).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  sort: z.number().int().optional(),
  description: z.string().max(500).nullable().optional(),
});
const updateSchema = createSchema.partial();

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['WorkflowCategories'], summary: '流程分类分页列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:list' })] as const,
    request: { query: PaginationQuery.extend({ keyword: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(WorkflowCategoryDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listWorkflowCategories(c.req.valid('query'))), 200),
});

const allRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/all', tags: ['WorkflowCategories'], summary: '全部流程分类（不分页）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(WorkflowCategoryDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listAllWorkflowCategories()), 200),
});

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/{id}', tags: ['WorkflowCategories'], summary: '获取流程分类',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(WorkflowCategoryDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getWorkflowCategory(c.req.valid('param').id)), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['WorkflowCategories'], summary: '创建流程分类',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '创建流程分类', module: '工作流管理' } })] as const,
    request: { body: { content: jsonContent(createSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowCategoryDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createWorkflowCategory(c.req.valid('json')), '创建成功'), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['WorkflowCategories'], summary: '更新流程分类',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '更新流程分类', module: '工作流管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowCategoryDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowCategoryBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateWorkflowCategory(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['WorkflowCategories'], summary: '删除流程分类',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '删除流程分类', module: '工作流管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowCategoryBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteWorkflowCategory(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([listRoute, allRoute, getRoute, createRouteDef, updateRoute, deleteRoute] as const);

export default router;
