import { OpenAPIHono } from '@hono/zod-openapi';
import { paymentReconContract } from '@zenith/shared/payment';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listReconBatches,
  getReconBatch,
  listReconItems,
  createReconBatch,
  deleteReconBatch,
  generateSampleBill,
  handleReconItem,
  autoReconcileForCurrentUser,
} from '../../services/payment/payment-recon.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });
const sampleRoute = defineContractRoute(paymentReconContract.sampleBill, {
  handler: async (c) => {
    const { applicationId, channel, channelConfigId, currency, billDate } = c.req.valid('query');
    return c.json(okBody({ billText: await generateSampleBill({ applicationId, channel, channelConfigId, currency, billDate }) }), 200);
  },
});
const itemsRoute = defineContractRoute(paymentReconContract.items, {
  handler: async (c) => c.json(okBody(await listReconItems(c.req.valid('param').id, c.req.valid('query'))), 200),
});

const autoRoute = defineContractRoute(paymentReconContract.auto, {
  handler: async (c) => c.json(okBody(await autoReconcileForCurrentUser(c.req.valid('json')), '对账完成'), 200),
});

const handleItemRoute = defineContractRoute(paymentReconContract.handleItem, {
  handler: async (c) => c.json(okBody(await handleReconItem(c.req.valid('param').id, c.req.valid('json')), '处理成功'), 200),
});

mountCrud(router, paymentReconContract,
  { list: listReconBatches, get: getReconBatch, create: createReconBatch, remove: deleteReconBatch },
  {
    messages: { create: '对账完成' },
  },
  [sampleRoute, autoRoute, itemsRoute, handleItemRoute],
);

export default router;
