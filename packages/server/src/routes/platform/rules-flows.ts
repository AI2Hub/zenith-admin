import { OpenAPIHono } from '@hono/zod-openapi';
import { decisionFlowContract } from '@zenith/shared/rules';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { sensitiveRateLimit } from '../../middleware/rate-limit';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listDecisionFlows,
  getDecisionFlow,
  createDecisionFlow,
  updateDecisionFlow,
  deleteDecisionFlow,
  deleteDecisionFlows,
  toggleDecisionFlow,
  publishDecisionFlow,
  testEvaluateDecisionFlow,
  evaluateDecisionFlowByKey,
  listDecisionFlowVersions,
  rollbackDecisionFlow,
} from '../../services/platform/rules-flow.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'rule:flow:list' })] as const;

const versionsRoute = defineContractRoute(decisionFlowContract.versions, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listDecisionFlowVersions(c.req.valid('param').id)), 200),
});

const rollbackRoute = defineContractRoute(decisionFlowContract.rollback, {
  middleware: [authMiddleware, guard({ permission: 'rule:flow:update', audit: { description: '回滚决策流版本', module: '规则中心' } })],
  handler: async (c) => {
    const { id, version } = c.req.valid('param');
    return c.json(okBody(await rollbackDecisionFlow(id, version), '回滚成功'), 200);
  },
});
const publishRoute = defineContractRoute(decisionFlowContract.publish, {
  middleware: [authMiddleware, guard({ permission: 'rule:flow:publish', audit: { description: '发布决策流', module: '规则中心' } })],
  handler: async (c) => c.json(okBody(await publishDecisionFlow(c.req.valid('param').id), '发布成功'), 200),
});

const toggleRoute = defineContractRoute(decisionFlowContract.toggle, {
  middleware: [authMiddleware, guard({ permission: 'rule:flow:publish', audit: { description: '启用/停用决策流', module: '规则中心' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { enabled } = c.req.valid('json');
    return c.json(okBody(await toggleDecisionFlow(id, enabled), enabled ? '已启用' : '已停用'), 200);
  },
});

const testRoute = defineContractRoute(decisionFlowContract.test, {
  middleware: [authMiddleware, guard({ permission: 'rule:flow:evaluate' })],
  handler: async (c) => c.json(okBody(await testEvaluateDecisionFlow(c.req.valid('param').id, c.req.valid('json').input)), 200),
});

const evaluateRoute = defineContractRoute(decisionFlowContract.evaluate, {
  middleware: [authMiddleware, sensitiveRateLimit, guard({ permission: 'rule:flow:evaluate' })],
  handler: async (c) => {
    const b = c.req.valid('json');
    return c.json(okBody(await evaluateDecisionFlowByKey(b.key, b.input)), 200);
  },
});

mountCrud(router, decisionFlowContract,
  {
    list: listDecisionFlows,
    get: getDecisionFlow,
    create: createDecisionFlow,
    update: updateDecisionFlow,
    remove: deleteDecisionFlow,
    removeMany: deleteDecisionFlows,
  },
  { permission: 'rule:flow', label: '决策流', module: '规则中心', messages: { removeBatch: '删除成功' } },
  [versionsRoute, rollbackRoute, publishRoute, toggleRoute, testRoute, evaluateRoute],
);

export default router;
