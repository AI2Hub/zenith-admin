import { OpenAPIHono } from '@hono/zod-openapi';
import { memberCheckinContract } from '@zenith/shared/member';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { getCheckinCalendar, listMemberCheckins } from '../../services/member/member-checkin.service';
import { mountCrud } from '../_crud';

const memberCheckinsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'member:checkin:log:list' })] as const;
const calendarRoute = defineContractRoute(memberCheckinContract.calendar, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getCheckinCalendar(c.req.valid('query').month)), 200),
});

mountCrud(memberCheckinsRouter, memberCheckinContract,
  { list: listMemberCheckins },
  { permission: 'member:checkin:log' },
  [calendarRoute],
);

export default memberCheckinsRouter;
