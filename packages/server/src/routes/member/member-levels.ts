import { OpenAPIHono } from '@hono/zod-openapi';
import { memberLevelContract } from '@zenith/shared/member';
import { validationHook } from '../../lib/openapi-schemas';
import {
  listLevels,
  getLevel,
  createLevel,
  updateLevel,
  deleteLevel,
} from '../../services/member/member-levels.service';
import { mountCrud } from '../_crud';

const levelsRouter = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(levelsRouter, memberLevelContract,
  { get: getLevel, create: createLevel, update: updateLevel, remove: deleteLevel, list: listLevels },
  { permission: 'member:level', label: '会员等级', module: '会员等级' },
);

export default levelsRouter;
