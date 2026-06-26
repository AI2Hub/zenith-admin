import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import { guard, setAuditBeforeData } from '../middleware/guard';
import { jsonContent, validationHook, commonErrorResponses, ok, okMsg, IdParam, okBody } from '../lib/openapi-schemas';
import { createWorkflowTemplateSchema, updateWorkflowTemplateSchema, saveAsTemplateSchema, cloneFromTemplateSchema } from '@zenith/shared';
import { WorkflowTemplateDTO, WorkflowDefinitionDTO } from '../lib/openapi-dtos';
import {
  listWorkflowTemplates, createWorkflowTemplate, updateWorkflowTemplate, deleteWorkflowTemplate,
  cloneTemplateToDefinition, saveAsTemplate, getWorkflowTemplateBeforeAudit,
} from '../services/workflow-templates.service';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/', tags: ['WorkflowTemplates'], summary: '流程模板列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(WorkflowTemplateDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listWorkflowTemplates()), 200),
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/', tags: ['WorkflowTemplates'], summary: '新增模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '新增流程模板', module: '工作流管理' } })] as const,
    request: { body: { content: jsonContent(createWorkflowTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowTemplateDTO, '已新增') },
  }),
  handler: async (c) => c.json(okBody(await createWorkflowTemplate(c.req.valid('json')), '已新增'), 200),
});

const saveAsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/save-as', tags: ['WorkflowTemplates'], summary: '将流程定义另存为模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '流程另存为模板', module: '工作流管理' } })] as const,
    request: { body: { content: jsonContent(saveAsTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowTemplateDTO, '已保存为模板') },
  }),
  handler: async (c) => c.json(okBody(await saveAsTemplate(c.req.valid('json')), '已保存为模板'), 200),
});

const cloneRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/{id}/clone', tags: ['WorkflowTemplates'], summary: '从模板创建流程',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:create', audit: { description: '从模板创建流程', module: '工作流管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(cloneFromTemplateSchema), required: false } },
    responses: { ...commonErrorResponses, ...ok(WorkflowDefinitionDTO, '已创建') },
  }),
  handler: async (c) => {
    const body = c.req.valid('json');
    return c.json(okBody(await cloneTemplateToDefinition(c.req.valid('param').id, body ?? {}), '已创建'), 200);
  },
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/{id}', tags: ['WorkflowTemplates'], summary: '更新模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '更新流程模板', module: '工作流管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateWorkflowTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(WorkflowTemplateDTO, '已更新') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowTemplateBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateWorkflowTemplate(id, c.req.valid('json')), '已更新'), 200);
  },
});

const deleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/{id}', tags: ['WorkflowTemplates'], summary: '删除模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '删除流程模板', module: '工作流管理' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('已删除') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowTemplateBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteWorkflowTemplate(id);
    return c.json(okBody(null, '已删除'), 200);
  },
});

router.openapiRoutes([listRoute, createRouteDef, saveAsRoute, cloneRoute, updateRoute, deleteRoute] as const);

export default router;
