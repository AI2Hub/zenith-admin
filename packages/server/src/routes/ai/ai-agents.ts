import { OpenAPIHono } from '@hono/zod-openapi';
import { aiAgentContract } from '@zenith/shared/ai';
import { authMiddleware } from '../../middleware/auth';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMyAgents,
  listBuiltinAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentDetail,
} from '../../services/ai/ai-agents.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const authed = [authMiddleware] as const;

const builtin = defineContractRoute(aiAgentContract.builtin, {
  middleware: authed,
  handler: async (c) => c.json(okBody(await listBuiltinAgents()), 200),
});

mountCrud(router, aiAgentContract,
  { get: getAgentDetail, create: createAgent, update: updateAgent, remove: deleteAgent, list: listMyAgents },
  { permission: null, audit: null },
  [builtin],
);

export default router;
