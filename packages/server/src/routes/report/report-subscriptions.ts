import { OpenAPIHono } from '@hono/zod-openapi';
import { reportSubscriptionContract } from '@zenith/shared/report';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  ensureSubscriptionExists,
  mapSubscription,
  batchSetSubscriptionEnabled,
} from '../../services/report/report-subscription.service';
import { submitSubscriptionDeliveryTask } from '../../services/report/report-delivery-tasks';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const notFound = { 404: { content: jsonContent(ErrorResponse), description: '不存在' } } as const;
const batchStatusRoute = defineContractRoute(reportSubscriptionContract.batchStatus, {
  middleware: [authMiddleware, guard({ permission: 'report:subscription:update', audit: { description: '批量更新报表订阅状态', module: '报表订阅' } })],
  handler: async (c) => {
    const { ids, enabled } = c.req.valid('json');
    const count = await batchSetSubscriptionEnabled(ids, enabled);
    return c.json(okBody(null, `已更新 ${count} 条订阅状态`), 200);
  },
});

const runRoute = defineContractRoute(reportSubscriptionContract.run, {
  middleware: [authMiddleware, guard({ permission: 'report:subscription:update', audit: { description: '手动推送报表订阅', module: '报表订阅' } })],
  responses: notFound,
  handler: async (c) => c.json(okBody(await submitSubscriptionDeliveryTask(c.req.valid('param').id), '任务已提交，可在任务中心查看进度'), 200),
});

mountCrud(router, reportSubscriptionContract,
  {
    list: listSubscriptions,
    get: async (id: number) => mapSubscription(await ensureSubscriptionExists(id)),
    create: createSubscription,
    update: updateSubscription,
    remove: deleteSubscription,
  },
  {
    permission: 'report:subscription',
    label: '报表订阅',
    module: '报表订阅',
    responses: { update: notFound, remove: notFound },
  },
  [batchStatusRoute, runRoute],
);

export default router;
