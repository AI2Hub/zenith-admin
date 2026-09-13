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

const listMine = defineContractRoute(aiAgentContract.list, {
  middleware: authed,
  handler: async (c) => c.json(okBody(await listMyAgents()), 200),
});

const builtin = defineContractRoute(aiAgentContract.builtin, {
  middleware: authed,
  handler: async (c) => c.json(okBody(await listBuiltinAgents()), 200),
});

mountCrud(router, aiAgentContract,
  { get: getAgentDetail, create: createAgent, update: updateAgent, remove: deleteAgent },
  { permission: null, audit: null, exclude: ['list'] },
  [listMine, builtin],
);

export default router;
