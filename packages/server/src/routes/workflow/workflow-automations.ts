import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowAutomationContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listWorkflowAutomations,
  listWorkflowAutomationRuns,
  getWorkflowAutomation,
  createWorkflowAutomation,
  updateWorkflowAutomation,
  deleteWorkflowAutomation,
  batchDeleteWorkflowAutomations,
  getWorkflowAutomationsBeforeAudit,
} from '../../services/workflow/workflow-automations.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'workflow:definition:list' })] as const;
const listRunsRoute = defineContractRoute(workflowAutomationContract.runs, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listWorkflowAutomationRuns(c.req.valid('query'))), 200),
});
const batchDeleteRoute = defineContractRoute(workflowAutomationContract.batchDelete, {
  middleware: [authMiddleware, guard({ permission: 'workflow:definition:edit', audit: { description: '批量删除流程自动化规则', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const before = await getWorkflowAutomationsBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const n = await batchDeleteWorkflowAutomations(ids);
    return c.json(okBody(null, `成功删除 ${n} 条`), 200);
  },
});

mountCrud(router, workflowAutomationContract,
  {
    list: listWorkflowAutomations,
    get: getWorkflowAutomation,
    create: createWorkflowAutomation,
    update: updateWorkflowAutomation,
    remove: deleteWorkflowAutomation,
  },
  {
    permission: { read: 'workflow:definition:list', write: 'workflow:definition:edit' },
    label: '流程自动化规则',
    module: '工作流管理',
  },
  [listRunsRoute, batchDeleteRoute],
);

export default router;
