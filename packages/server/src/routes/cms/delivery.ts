import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsDeliveryContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { mountCrud } from '../_crud';
import { getCmsDeliveryConfig, getCmsDeliveryRun, listCmsDeliveryRuns, retryCmsDelivery, saveCmsDeliveryConfig, startCmsDelivery } from '../../services/cms/cms-delivery.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(router, cmsDeliveryContract, { list: listCmsDeliveryRuns, get: getCmsDeliveryRun }, {}, [
  defineContractRoute(cmsDeliveryContract.config, { handler: async c => c.json(okBody(await getCmsDeliveryConfig(c.req.valid('query').siteId)), 200) }),
  defineContractRoute(cmsDeliveryContract.saveConfig, { handler: async c => c.json(okBody(await saveCmsDeliveryConfig(c.req.valid('query').siteId, c.req.valid('json')), '交付入口已保存，请验证当前公开版本'), 200) }),
  defineContractRoute(cmsDeliveryContract.start, { handler: async c => c.json(okBody(await startCmsDelivery(c.req.valid('json').siteId)), 200) }),
  defineContractRoute(cmsDeliveryContract.retry, { handler: async c => c.json(okBody(await retryCmsDelivery(c.req.valid('param').id)), 200) }),
]);
export default router;
