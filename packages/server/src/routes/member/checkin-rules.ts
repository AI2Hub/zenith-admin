import { OpenAPIHono } from '@hono/zod-openapi';
import { checkinRuleContract } from '@zenith/shared/member';
import { validationHook } from '../../lib/openapi-schemas';
import {
  listCheckinRules,
  createCheckinRule,
  updateCheckinRule,
  deleteCheckinRule,
  ensureCheckinRuleExists,
} from '../../services/member/checkin-rules.service';
import { mountCrud } from '../_crud';

const checkinRulesRouter = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(checkinRulesRouter, checkinRuleContract,
  {
    create: createCheckinRule,
    list: listCheckinRules,
    get: ensureCheckinRuleExists,
    update: updateCheckinRule,
    remove: deleteCheckinRule,
  },
  { permission: 'member:checkin:rule', label: '签到规则', module: '会员签到' },
);

export default checkinRulesRouter;
