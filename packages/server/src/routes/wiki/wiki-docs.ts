import { OpenAPIHono } from '@hono/zod-openapi';
import { wikiDocContract } from '@zenith/shared/wiki';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  confirmWikiDocRead,
  createWikiDoc,
  deleteWikiDoc,
  ensureWikiDocExists,
  favoriteWikiDoc,
  getWikiDoc,
  getWikiDocReadReceipts,
  getWikiDocTree,
  getWikiDocVersion,
  listMyFavoriteWikiDocs,
  listMyProcessedReviews,
  listRecentWikiDocs,
  listWikiDocReviewRecords,
  listWikiDocVersions,
  listWikiDocs,
  mapWikiDoc,
  moveWikiDoc,
  purgeWikiDoc,
  recordWikiDocView,
  reportWikiSearchClick,
  restoreWikiDoc,
  reviewWikiDoc,
  rollbackWikiDoc,
  searchWikiDocs,
  submitWikiDoc,
  subscribeWikiDoc,
  updateWikiDoc,
  withdrawWikiDoc,
} from '../../services/wiki/docs.service';
import { mountCrud } from '../_crud';

const docsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'wiki:doc:list' })] as const;
const searchRoute = defineContractRoute(wikiDocContract.search, {
  middleware: read,
  handler: async (c) => c.json(okBody(await searchWikiDocs(c.req.valid('query'))), 200),
});

const searchClickRoute = defineContractRoute(wikiDocContract.reportSearchClick, {
  middleware: read,
  handler: async (c) => {
    const { keyword, docId } = c.req.valid('json');
    await reportWikiSearchClick(keyword, docId);
    return c.json(okBody(null), 200);
  },
});

const recentRoute = defineContractRoute(wikiDocContract.recent, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listRecentWikiDocs()), 200),
});

const processedReviewsRoute = defineContractRoute(wikiDocContract.processedReviews, {
  middleware: [authMiddleware, guard({ permission: 'wiki:approval:list' })],
  handler: async (c) => c.json(okBody(await listMyProcessedReviews(c.req.valid('query'))), 200),
});

const treeRoute = defineContractRoute(wikiDocContract.tree, {
  middleware: read,
  handler: async (c) => {
    const { spaceId } = c.req.valid('query');
    return c.json(okBody(await getWikiDocTree(spaceId)), 200);
  },
});

const favoritesRoute = defineContractRoute(wikiDocContract.favorites, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listMyFavoriteWikiDocs(c.req.valid('query'))), 200),
});

const recycleRoute = defineContractRoute(wikiDocContract.recycle, {
  middleware: [authMiddleware, guard({ permission: 'wiki:recycle:list' })],
  handler: async (c) => c.json(okBody(await listWikiDocs({ ...c.req.valid('query'), deleted: true })), 200),
});
// ─── 移动 / 发布流 / 收藏 / 浏览 ──────────────────────────────────────────────

const moveRoute = defineContractRoute(wikiDocContract.move, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:doc:move',
    audit: { description: '移动文档', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await moveWikiDoc(id, c.req.valid('json')), '移动成功'), 200);
  },
});

const submitRoute = defineContractRoute(wikiDocContract.submit, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:doc:publish',
    audit: { description: '提交发布文档', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await submitWikiDoc(id), '提交成功'), 200);
  },
});

const withdrawRoute = defineContractRoute(wikiDocContract.withdraw, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:doc:publish',
    audit: { description: '撤回文档审核', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await withdrawWikiDoc(id), '已撤回'), 200);
  },
});

const reviewRoute = defineContractRoute(wikiDocContract.review, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:approval:review',
    audit: { description: '审核文档', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await reviewWikiDoc(id, c.req.valid('json')), '审核完成'), 200);
  },
});

const favoriteRoute = defineContractRoute(wikiDocContract.favorite, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { favorite } = c.req.valid('json');
    await favoriteWikiDoc(id, favorite);
    return c.json(okBody(null, favorite ? '已收藏' : '已取消收藏'), 200);
  },
});

const subscribeRoute = defineContractRoute(wikiDocContract.subscribe, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { subscribe } = c.req.valid('json');
    await subscribeWikiDoc(id, subscribe);
    return c.json(okBody(null, subscribe ? '已订阅' : '已取消订阅'), 200);
  },
});

const readReceiptRoute = defineContractRoute(wikiDocContract.confirmRead, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await confirmWikiDocRead(id);
    return c.json(okBody(null, '已确认阅读'), 200);
  },
});

const readReceiptsRoute = defineContractRoute(wikiDocContract.readReceipts, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await getWikiDocReadReceipts(id)), 200);
  },
});

const reviewRecordsRoute = defineContractRoute(wikiDocContract.reviewRecords, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await listWikiDocReviewRecords(id)), 200);
  },
});

const viewRoute = defineContractRoute(wikiDocContract.view, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await recordWikiDocView(id);
    return c.json(okBody(null), 200);
  },
});

// ─── 版本 ─────────────────────────────────────────────────────────────────────

const versionsRoute = defineContractRoute(wikiDocContract.versions, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await listWikiDocVersions(id, c.req.valid('query'))), 200);
  },
});

const versionDetailRoute = defineContractRoute(wikiDocContract.versionDetail, {
  middleware: read,
  handler: async (c) => {
    const { id, version } = c.req.valid('param');
    return c.json(okBody(await getWikiDocVersion(id, version)), 200);
  },
});

const rollbackRoute = defineContractRoute(wikiDocContract.rollback, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:doc:edit',
    audit: { description: '回滚文档版本', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { version } = c.req.valid('json');
    setAuditBeforeData(c, mapWikiDoc(await ensureWikiDocExists(id)));
    return c.json(okBody(await rollbackWikiDoc(id, version), '回滚成功'), 200);
  },
});

// ─── 回收站 ───────────────────────────────────────────────────────────────────

const restoreRoute = defineContractRoute(wikiDocContract.restore, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:recycle:restore',
    audit: { description: '还原文档', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await restoreWikiDoc(id), '还原成功'), 200);
  },
});

const purgeRoute = defineContractRoute(wikiDocContract.purge, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:recycle:purge',
    audit: { description: '彻底删除文档', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await purgeWikiDoc(id);
    return c.json(okBody(null, '已彻底删除'), 200);
  },
});

mountCrud(docsRouter, wikiDocContract,
  { list: listWikiDocs, get: getWikiDoc, create: createWikiDoc, update: updateWikiDoc, remove: deleteWikiDoc },
  {
    permission: { read: 'wiki:doc:list', create: 'wiki:doc:create', update: 'wiki:doc:edit', remove: 'wiki:doc:delete' },
    label: '文档',
    module: '知识中心',
    messages: { remove: '已移入回收站' },
  },
  [
    searchRoute,
    searchClickRoute,
    recentRoute,
    processedReviewsRoute,
    treeRoute,
    favoritesRoute,
    recycleRoute,
    moveRoute,
    submitRoute,
    withdrawRoute,
    reviewRoute,
    favoriteRoute,
    subscribeRoute,
    readReceiptRoute,
    readReceiptsRoute,
    reviewRecordsRoute,
    viewRoute,
    versionsRoute,
    versionDetailRoute,
    rollbackRoute,
    restoreRoute,
    purgeRoute,
  ],
);

export default docsRouter;
