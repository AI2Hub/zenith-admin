import { OpenAPIHono } from '@hono/zod-openapi';
import { reportEnvironmentContract } from '@zenith/shared/report';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import {
  createReportEnvironment,
  createReportEnvironmentPromotion,
  deleteReportEnvironment,
  listReportEnvironmentPromotions,
  listReportEnvironments,
  transitionReportEnvironmentPromotion,
  updateReportEnvironment,
  getReportEnvironment,
} from '../../services/report/report-governance.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const listPromotionsRoute = defineContractRoute(reportEnvironmentContract.promotions, {
  middleware: [authMiddleware, guard({ permission: 'report:environment:promote' })],
  handler: async (c) => c.json(okBody(await listReportEnvironmentPromotions(c.req.valid('query'))), 200),
});

const createPromotionRoute = defineContractRoute(reportEnvironmentContract.createPromotion, {
  middleware: [authMiddleware, guard({ permission: 'report:environment:promote', audit: { module: '报表环境治理', description: '创建资源发布' } })],
  handler: async (c) => c.json(okBody(await createReportEnvironmentPromotion(c.req.valid('json')), '创建成功'), 200),
});

const transitionPromotionRoute = defineContractRoute(reportEnvironmentContract.transitionPromotion, {
  middleware: [authMiddleware, guard({ permission: 'report:environment:promote', audit: { module: '报表环境治理', description: '变更资源发布状态' } })],
  handler: async (c) => c.json(okBody(await transitionReportEnvironmentPromotion(c.req.valid('param').id, c.req.valid('json')), '操作成功'), 200),
});

mountCrud(router, reportEnvironmentContract,
  {
    create: createReportEnvironment,
    list: listReportEnvironments,
    get: getReportEnvironment,
    update: updateReportEnvironment,
    remove: deleteReportEnvironment,
  },
  { permission: 'report:environment', label: '报表环境', module: '报表环境治理' },
  [listPromotionsRoute, createPromotionRoute, transitionPromotionRoute],
);

export default router;
