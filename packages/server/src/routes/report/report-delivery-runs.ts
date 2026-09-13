import { OpenAPIHono } from '@hono/zod-openapi';
import { reportDeliveryRunContract } from '@zenith/shared/report';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import { acknowledgeAlertDeliveryRun, listAccessibleDeliveryRuns } from '../../services/report/report-delivery.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });
const ackRoute = defineContractRoute(reportDeliveryRunContract.acknowledge, {
  middleware: [authMiddleware, guard({ permission: 'report:alert:update' })],
  responses: { 404: { content: jsonContent(ErrorResponse), description: '不存在' } },
  handler: async (c) => c.json(okBody(await acknowledgeAlertDeliveryRun(c.req.valid('param').id, c.req.valid('json').note), '确认成功'), 200),
});

mountCrud(router, reportDeliveryRunContract,
  { list: listAccessibleDeliveryRuns },
  { permission: { read: ['report:alert:list', 'report:subscription:list'] } },
  [ackRoute],
);

export default router;
