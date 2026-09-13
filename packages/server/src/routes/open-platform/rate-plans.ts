import { OpenAPIHono } from '@hono/zod-openapi';
import { ratePlanContract } from '@zenith/shared/open-platform';
import { authMiddleware } from '../../middleware/auth';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listEnabledRatePlans,
  createRatePlan,
  updateRatePlan,
  ratePlanService,
} from '../../services/open-platform/rate-plans.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const MODULE = '开放平台-限流套餐';
const options = defineContractRoute(ratePlanContract.options, {
  middleware: [authMiddleware],
  handler: async (c) => c.json(okBody(await listEnabledRatePlans()), 200),
});

mountCrud(router, ratePlanContract,
  {
    list: ratePlanService.list,
    get: ratePlanService.get,
    create: createRatePlan,
    update: updateRatePlan,
    remove: ratePlanService.remove,
  },
  { permission: { read: 'open:rate-plan:view', write: 'open:rate-plan:manage' }, label: '限流套餐', module: MODULE },
  [options],
);

export default router;
