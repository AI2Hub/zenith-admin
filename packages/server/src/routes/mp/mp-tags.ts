import { OpenAPIHono } from '@hono/zod-openapi';
import { mpTagContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMpTags,
  createMpTag,
  updateMpTag,
  deleteMpTag,
  getMpTagBeforeAudit,
  syncMpTags,
} from '../../services/mp/mp-tag.service';
import { mountCrud } from '../_crud';

const mpTagsRouter = new OpenAPIHono({ defaultHook: validationHook });
const syncRoute = defineContractRoute(mpTagContract.sync, {
  middleware: [authMiddleware, guard({ permission: 'mp:tag:sync', audit: { description: '同步公众号标签', module: '公众号标签' } })],
  handler: async (c) => c.json(okBody(await syncMpTags(c.req.valid('json').accountId), '同步完成'), 200),
});

mountCrud(mpTagsRouter, mpTagContract,
  { list: listMpTags, get: getMpTagBeforeAudit, create: createMpTag, update: updateMpTag, remove: deleteMpTag },
  { permission: 'mp:tag', label: '公众号标签', module: '公众号标签' },
  [syncRoute],
);

export default mpTagsRouter;
