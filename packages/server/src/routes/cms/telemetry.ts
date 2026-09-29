import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsTelemetryAdminContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { configureCmsTelemetry } from '../../services/cms/cms-telemetry.service';
import { listCmsTelemetryDeliveries, getCmsTelemetryDeliverySummary, replayCmsTelemetryDelivery } from '../../services/cms/cms-telemetry-deliveries.service';
const router = new OpenAPIHono({ defaultHook: validationHook });
router.openapiRoutes([
  defineContractRoute(cmsTelemetryAdminContract.deliveries, { handler: async c => c.json(okBody(await listCmsTelemetryDeliveries(c.req.valid('param').id,c.req.valid('query'))),200) }),
  defineContractRoute(cmsTelemetryAdminContract.deliverySummary, { handler: async c => c.json(okBody(await getCmsTelemetryDeliverySummary(c.req.valid('param').id)),200) }),
  defineContractRoute(cmsTelemetryAdminContract.replay, { handler: async c => c.json(okBody(await replayCmsTelemetryDelivery(c.req.valid('param').id,c.req.valid('param').deliveryId)),200) }),
  defineContractRoute(cmsTelemetryAdminContract.configure, {
  handler: async c => c.json(okBody(await configureCmsTelemetry(c.req.valid('param').id, c.req.valid('json'))), 200),
})]);
export default router;
