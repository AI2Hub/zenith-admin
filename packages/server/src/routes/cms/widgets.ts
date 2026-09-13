import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsWidgetContract } from '@zenith/shared/cms';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  createCmsWidget,
  deleteCmsWidget,
  getCmsWidget,
  getCmsWidgetPreview,
  listCmsWidgetRefs,
  listCmsWidgetRenderersForSite,
  listCmsWidgetSlots,
  listCmsWidgetSourceReferences,
  listCmsWidgets,
  listPublishedCmsWidgets,
  offlineCmsWidget,
  publishCmsWidget,
  saveCmsWidgetSlot,
  updateCmsWidget,
} from '../../services/cms/cms-widgets.service';
import { submitCmsWidgetBatchTask } from '../../services/cms/cms-widget-tasks';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'cms:widget:list' })] as const;
const optionsRoute = defineContractRoute(cmsWidgetContract.options, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listPublishedCmsWidgets(c.req.valid('query').siteId)), 200),
});

const renderersRoute = defineContractRoute(cmsWidgetContract.renderers, {
  middleware: read,
  handler: async (c) => {
    const { siteId, type } = c.req.valid('query');
    return c.json(okBody(await listCmsWidgetRenderersForSite(siteId, type)), 200);
  },
});

const slotsRoute = defineContractRoute(cmsWidgetContract.slots, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listCmsWidgetSlots(c.req.valid('query').siteId)), 200),
});

const saveSlotRoute = defineContractRoute(cmsWidgetContract.saveSlot, {
  middleware: [authMiddleware, guard({
    permission: 'cms:widget:bind',
    audit: { description: '更新 CMS 主题页面部件插槽', module: 'CMS内容管理' },
  })],
  handler: async (c) => c.json(okBody(await saveCmsWidgetSlot(
    c.req.valid('param').slotKey,
    c.req.valid('json'),
  ), '主题插槽已更新'), 200),
});

const batchRoute = defineContractRoute(cmsWidgetContract.batch, {
  middleware: [authMiddleware, guard({
    permission: 'cms:widget:list',
    audit: { description: '提交 CMS 页面部件批量操作', module: 'CMS内容管理' },
  })],
  handler: async (c) => c.json(okBody(
    await submitCmsWidgetBatchTask(c.req.valid('json')),
    '批量任务已提交',
  ), 200),
});

const sourceRefsRoute = defineContractRoute(cmsWidgetContract.sourceRefs, {
  middleware: read,
  handler: async (c) => {
    const { sourceType, sourceId } = c.req.valid('query');
    return c.json(okBody(await listCmsWidgetSourceReferences(sourceType, sourceId)), 200);
  },
});
const refsRoute = defineContractRoute(cmsWidgetContract.refs, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listCmsWidgetRefs(c.req.valid('param').id)), 200),
});

const previewRoute = defineContractRoute(cmsWidgetContract.preview, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getCmsWidgetPreview(
    c.req.valid('param').id,
    c.req.valid('query').rendererKey,
  )), 200),
});
const publishRoute = defineContractRoute(cmsWidgetContract.publish, {
  middleware: [authMiddleware, guard({
    permission: 'cms:widget:publish',
    audit: { description: '发布 CMS 页面部件', module: 'CMS内容管理' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getCmsWidget(id));
    return c.json(okBody(await publishCmsWidget(id), '发布成功，引用刷新任务已提交'), 200);
  },
});

const offlineRoute = defineContractRoute(cmsWidgetContract.offline, {
  middleware: [authMiddleware, guard({
    permission: 'cms:widget:offline',
    audit: { description: '下线 CMS 页面部件', module: 'CMS内容管理' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getCmsWidget(id));
    return c.json(okBody(await offlineCmsWidget(id), '下线成功，引用刷新任务已提交'), 200);
  },
});

mountCrud(router, cmsWidgetContract,
  {
    list: listCmsWidgets,
    get: getCmsWidget,
    create: createCmsWidget,
    update: updateCmsWidget,
    remove: deleteCmsWidget,
  },
  {
    permission: 'cms:widget',
    label: ' CMS 页面部件',
    module: 'CMS内容管理',
    audit: { update: '更新 CMS 页面部件草稿' },
    messages: { update: '保存成功' },
  },
  [
    optionsRoute,
    renderersRoute,
    slotsRoute,
    saveSlotRoute,
    batchRoute,
    sourceRefsRoute,
    refsRoute,
    previewRoute,
    publishRoute,
    offlineRoute,
  ],
);

export default router;
