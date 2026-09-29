import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsDeploymentRetentionContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { mapAsyncTask } from '../../lib/task-center';
import { getCmsDeploymentCapacitySummary, listCmsDeploymentCapacity, pinCmsDeployment, previewCmsDeploymentCleanup, saveCmsDeploymentRetentionPolicy } from '../../services/cms/cms-deployment-retention.service';
import { submitCmsDeploymentCleanup, submitCmsDeploymentMeasurement } from '../../services/cms/cms-deployment-retention-tasks';

const router = new OpenAPIHono({ defaultHook: validationHook });
router.openapiRoutes([
  defineContractRoute(cmsDeploymentRetentionContract.list, { handler: async c => c.json(okBody(await listCmsDeploymentCapacity(c.req.valid('query'))), 200) }),
  defineContractRoute(cmsDeploymentRetentionContract.summary, { handler: async c => c.json(okBody(await getCmsDeploymentCapacitySummary(c.req.valid('param').id)), 200) }),
  defineContractRoute(cmsDeploymentRetentionContract.savePolicy, { handler: async c => c.json(okBody(await saveCmsDeploymentRetentionPolicy(c.req.valid('param').id, c.req.valid('json'))), 200) }),
  defineContractRoute(cmsDeploymentRetentionContract.pin, { handler: async c => c.json(okBody(await pinCmsDeployment(c.req.valid('param').id, c.req.valid('json'))), 200) }),
  defineContractRoute(cmsDeploymentRetentionContract.measure, { handler: async c => c.json(okBody(mapAsyncTask(await submitCmsDeploymentMeasurement(c.req.valid('param').id))), 200) }),
  defineContractRoute(cmsDeploymentRetentionContract.preview, { handler: async c => c.json(okBody(await previewCmsDeploymentCleanup(c.req.valid('param').id)), 200) }),
  defineContractRoute(cmsDeploymentRetentionContract.cleanup, { handler: async c => c.json(okBody(mapAsyncTask(await submitCmsDeploymentCleanup(c.req.valid('param').id, c.req.valid('json')))), 200) }),
]);
export default router;
