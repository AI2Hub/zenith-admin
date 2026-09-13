import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowTemplateContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listWorkflowTemplates,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
  cloneTemplateToDefinition,
  saveAsTemplate,
  getWorkflowTemplate,
} from '../../services/workflow/workflow-templates.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const saveAsRoute = defineContractRoute(workflowTemplateContract.saveAs, {
  middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '流程另存为模板', module: '工作流管理' } })] as const,
  handler: async (c) => c.json(okBody(await saveAsTemplate(c.req.valid('json')), '已保存为模板'), 200),
});

const cloneRoute = defineContractRoute(workflowTemplateContract.clone, {
  middleware: [authMiddleware, guard({ permission: 'workflow:definition:create', audit: { description: '从模板创建流程', module: '工作流管理' } })] as const,
  handler: async (c) => c.json(okBody(await cloneTemplateToDefinition(c.req.valid('param').id, c.req.valid('json')), '已创建'), 200),
});

mountCrud(router, workflowTemplateContract,
  {
    list: listWorkflowTemplates,
    get: getWorkflowTemplate,
    create: createWorkflowTemplate,
    update: updateWorkflowTemplate,
    remove: deleteWorkflowTemplate,
  },
  {
    permission: { read: 'workflow:definition:list', write: 'workflow:definition:edit' },
    label: '流程模板',
    module: '工作流管理',
    audit: { create: '新增流程模板' },
    messages: { create: '已新增', update: '已更新', remove: '已删除' },
  },
  [saveAsRoute, cloneRoute],
);

export default router;
