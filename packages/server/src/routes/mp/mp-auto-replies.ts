import { OpenAPIHono } from '@hono/zod-openapi';
import { mpAutoReplyContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  mpAutoReplyService,
  listMpUnmatchedKeywords,
  deleteMpUnmatchedKeyword,
  getMpUnmatchedKeywordBeforeAudit,
} from '../../services/mp/mp-auto-reply.service';
import { mountCrud } from '../_crud';

const mpAutoRepliesRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'mp:reply:list' })] as const;
const unmatchedListRoute = defineContractRoute(mpAutoReplyContract.unmatched, {
  middleware: read,
  handler: async (c) => {
    const q = c.req.valid('query');
    return c.json(okBody(await listMpUnmatchedKeywords(q.accountId, q.page, q.pageSize)), 200);
  },
});

const unmatchedDeleteRoute = defineContractRoute(mpAutoReplyContract.removeUnmatched, {
  middleware: [authMiddleware, guard({ permission: 'mp:reply:delete', audit: { description: '删除未命中热词', module: '公众号自动回复' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getMpUnmatchedKeywordBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteMpUnmatchedKeyword(id);
    return c.json(okBody(null, '已删除'), 200);
  },
});

mountCrud(mpAutoRepliesRouter, mpAutoReplyContract,
  mpAutoReplyService,
  { permission: 'mp:reply', label: '自动回复', module: '公众号自动回复' },
  [unmatchedListRoute, unmatchedDeleteRoute],
);

export default mpAutoRepliesRouter;
