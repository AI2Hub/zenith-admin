import { OpenAPIHono } from '@hono/zod-openapi';
import { mpDraftContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  getMpDraft,
  mpDraftService,
  pushMpDraft,
} from '../../services/mp/mp-draft.service';
import { mountCrud } from '../_crud';

const mpDraftsRouter = new OpenAPIHono({ defaultHook: validationHook });

const pushRoute = defineContractRoute(mpDraftContract.push, {
  middleware: [authMiddleware, guard({ permission: 'mp:draft:push', audit: { description: '推送图文草稿', module: '公众号图文' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpDraft(id));
    return c.json(okBody(await pushMpDraft(id), '推送成功'), 200);
  },
});

mountCrud(mpDraftsRouter, mpDraftContract,
  mpDraftService,
  { permission: 'mp:draft', label: '图文草稿', module: '公众号图文' },
  [pushRoute],
);

export default mpDraftsRouter;
