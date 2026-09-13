import { OpenAPIHono } from '@hono/zod-openapi';
import { wikiCommentContract } from '@zenith/shared/wiki';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  createWikiComment,
  deleteMyWikiComment,
  ensureWikiCommentExists,
  listWikiComments,
  listWikiDocComments,
  mapWikiComment,
  removeWikiComment,
  resolveWikiComment,
  updateWikiCommentStatus,
} from '../../services/wiki/comments.service';
import { mountCrud } from '../_crud';

const commentsRouter = new OpenAPIHono({ defaultHook: validationHook });

const reader = [authMiddleware, guard({ permission: 'wiki:doc:list' })] as const;

// ─── 用户端 ───────────────────────────────────────────────────────────────────

const docCommentsRoute = defineContractRoute(wikiCommentContract.docComments, {
  middleware: reader,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await listWikiDocComments(id)), 200);
  },
});
const resolveRoute = defineContractRoute(wikiCommentContract.resolve, {
  middleware: reader,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await resolveWikiComment(id), '已标记解决'), 200);
  },
});

const deleteMineRoute = defineContractRoute(wikiCommentContract.deleteMine, {
  middleware: reader,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await deleteMyWikiComment(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});
const statusRoute = defineContractRoute(wikiCommentContract.updateStatus, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:comment:audit',
    audit: { description: '审核评论', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { status } = c.req.valid('json');
    setAuditBeforeData(c, mapWikiComment(await ensureWikiCommentExists(id)));
    return c.json(okBody(await updateWikiCommentStatus(id, status), '操作成功'), 200);
  },
});

mountCrud(commentsRouter, wikiCommentContract,
  {
    list: listWikiComments,
    get: async (id: number) => mapWikiComment(await ensureWikiCommentExists(id)),
    create: createWikiComment,
    remove: removeWikiComment,
  },
  {
    permission: { read: 'wiki:comment:list', create: 'wiki:doc:list', remove: 'wiki:comment:delete' },
    label: '评论',
    module: '知识中心',
    audit: { create: null },
    messages: { create: '评论成功' },
  },
  [docCommentsRoute, deleteMineRoute, resolveRoute, statusRoute],
);

export default commentsRouter;
