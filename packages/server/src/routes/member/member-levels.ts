import { OpenAPIHono } from '@hono/zod-openapi';
import { memberLevelContract } from '@zenith/shared/member';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listLevels,
  getLevel,
  createLevel,
  updateLevel,
  deleteLevel,
} from '../../services/member/member-levels.service';
import { mountCrud } from '../_crud';

const levelsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'member:level:list' })] as const;

const listRoute = defineContractRoute(memberLevelContract.list, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listLevels()), 200),
});

mountCrud(levelsRouter, memberLevelContract,
  { get: getLevel, create: createLevel, update: updateLevel, remove: deleteLevel },
  { permission: 'member:level', label: '会员等级', module: '会员等级', exclude: ['list'] },
  [listRoute],
);

export default levelsRouter;
