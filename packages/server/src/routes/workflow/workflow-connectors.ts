import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowConnectorContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  workflowConnectorService,
  testWorkflowConnector,
  getConnectorStats,
  listConnectorInvocations,
} from '../../services/workflow/workflow-connectors.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'workflow:connector:list' })] as const;
const testRoute = defineContractRoute(workflowConnectorContract.test, {
  middleware: [authMiddleware, guard({ permission: 'workflow:connector:test', audit: { description: '测试流程连接器', module: '流程连接器' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await testWorkflowConnector(id, c.req.valid('json'))), 200);
  },
});

const statsRoute = defineContractRoute(workflowConnectorContract.stats, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getConnectorStats(c.req.valid('param').id, c.req.valid('query').days)), 200),
});

const invocationsRoute = defineContractRoute(workflowConnectorContract.invocations, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listConnectorInvocations(c.req.valid('param').id, c.req.valid('query').limit)), 200),
});

mountCrud(router, workflowConnectorContract,
  workflowConnectorService,
  { permission: 'workflow:connector', label: '流程连接器', module: '流程连接器' },
  [testRoute, statsRoute, invocationsRoute],
);

export default router;
