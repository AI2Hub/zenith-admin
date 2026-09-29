import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsContentReviewContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { mapAsyncTask } from '../../lib/task-center';
import { completeCmsContentReview, getCmsContentReviewPolicy, listCmsContentReviewPolicies, listCmsContentReviewRecords, saveCmsContentReviewPolicy } from '../../services/cms/cms-content-reviews.service';
import { submitCmsContentReviewScan } from '../../services/cms/cms-content-review-tasks';

const router = new OpenAPIHono({ defaultHook: validationHook });
router.openapiRoutes([
  defineContractRoute(cmsContentReviewContract.list, { handler: async c => c.json(okBody(await listCmsContentReviewPolicies(c.req.valid('query'))), 200) }),
  defineContractRoute(cmsContentReviewContract.detail, { handler: async c => c.json(okBody(await getCmsContentReviewPolicy(c.req.valid('param').id)), 200) }),
  defineContractRoute(cmsContentReviewContract.save, { handler: async c => c.json(okBody(await saveCmsContentReviewPolicy(c.req.valid('param').id, c.req.valid('json'))), 200) }),
  defineContractRoute(cmsContentReviewContract.records, { handler: async c => c.json(okBody(await listCmsContentReviewRecords(c.req.valid('param').id)), 200) }),
  defineContractRoute(cmsContentReviewContract.complete, { handler: async c => c.json(okBody(await completeCmsContentReview(c.req.valid('param').id, c.req.valid('json'))), 200) }),
  defineContractRoute(cmsContentReviewContract.scan, { handler: async c => c.json(okBody(mapAsyncTask(await submitCmsContentReviewScan(c.req.valid('json')))), 200) }),
]);
export default router;
