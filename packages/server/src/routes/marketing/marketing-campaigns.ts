/**
 * 营销活动管理
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { marketingCampaignContract } from '@zenith/shared/marketing';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listMarketingCampaigns,
  getMarketingCampaign,
  createMarketingCampaign,
  updateMarketingCampaign,
  deleteMarketingCampaign,
  publishMarketingCampaign,
  endMarketingCampaign,
  listMarketingPrizes,
  saveMarketingPrize,
  deleteMarketingPrize,
  listMarketingParticipations,
} from '../../services/marketing/marketing-campaigns.service';
import { mountCrud } from '../_crud';

const marketingRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'marketing:campaign:list' })] as const;
const publishRoute = defineContractRoute(marketingCampaignContract.publish, {
  middleware: [authMiddleware, guard({
    permission: 'marketing:campaign:publish',
    audit: { description: '发布营销活动', module: '营销活动' },
  })],
  handler: async (c) => c.json(okBody(await publishMarketingCampaign(c.req.valid('param').id), '发布成功'), 200),
});

const endRoute = defineContractRoute(marketingCampaignContract.end, {
  middleware: [authMiddleware, guard({
    permission: 'marketing:campaign:publish',
    audit: { description: '结束营销活动', module: '营销活动' },
  })],
  handler: async (c) => c.json(okBody(await endMarketingCampaign(c.req.valid('param').id), '活动已结束'), 200),
});

// ─── 奖品子资源 ───────────────────────────────────────────────────────────────
const listPrizesRoute = defineContractRoute(marketingCampaignContract.listPrizes, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listMarketingPrizes(c.req.valid('param').campaignId)), 200),
});

const createPrizeRoute = defineContractRoute(marketingCampaignContract.createPrize, {
  middleware: [authMiddleware, guard({
    permission: 'marketing:campaign:update',
    audit: { description: '新增活动奖品', module: '营销活动' },
  })],
  handler: async (c) => {
    const { campaignId } = c.req.valid('param');
    return c.json(okBody(await saveMarketingPrize(campaignId, null, c.req.valid('json')), '创建成功'), 200);
  },
});

const updatePrizeRoute = defineContractRoute(marketingCampaignContract.updatePrize, {
  middleware: [authMiddleware, guard({
    permission: 'marketing:campaign:update',
    audit: { description: '更新活动奖品', module: '营销活动' },
  })],
  handler: async (c) => {
    const { campaignId, prizeId } = c.req.valid('param');
    return c.json(okBody(await saveMarketingPrize(campaignId, prizeId, c.req.valid('json')), '更新成功'), 200);
  },
});

const deletePrizeRoute = defineContractRoute(marketingCampaignContract.removePrize, {
  middleware: [authMiddleware, guard({
    permission: 'marketing:campaign:update',
    audit: { description: '删除活动奖品', module: '营销活动' },
  })],
  handler: async (c) => {
    const { campaignId, prizeId } = c.req.valid('param');
    await deleteMarketingPrize(campaignId, prizeId);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

// ─── 参与记录 ─────────────────────────────────────────────────────────────────
const listParticipationsRoute = defineContractRoute(marketingCampaignContract.listParticipations, {
  middleware: [authMiddleware, guard({ permission: 'marketing:record:list' })],
  handler: async (c) => {
    const { campaignId } = c.req.valid('param');
    return c.json(okBody(await listMarketingParticipations(campaignId, c.req.valid('query'))), 200);
  },
});

mountCrud(marketingRouter, marketingCampaignContract,
  {
    list: listMarketingCampaigns,
    get: getMarketingCampaign,
    create: createMarketingCampaign,
    update: updateMarketingCampaign,
    remove: deleteMarketingCampaign,
  },
  { permission: 'marketing:campaign', label: '营销活动', module: '营销活动' },
  [
    listPrizesRoute,
    createPrizeRoute,
    updatePrizeRoute,
    deletePrizeRoute,
    listParticipationsRoute,
    publishRoute,
    endRoute,
  ],
);

export default marketingRouter;
