import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsContentCollectionContract as contract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { allCmsContentCollections, cmsCollectionVersions, getCmsContentCollection, listCmsContentCollections, previewCmsCollection, removeCmsContentCollection, saveCmsContentCollection } from '../../services/cms/cms-content-collections.service';
const router = new OpenAPIHono({ defaultHook: validationHook });
router.openapiRoutes([
  defineContractRoute(contract.list, { handler: async c => c.json(okBody(await listCmsContentCollections(c.req.valid('query'))), 200) }),
  defineContractRoute(contract.all, { handler: async c => c.json(okBody(await allCmsContentCollections(c.req.valid('query').siteId)), 200) }),
  defineContractRoute(contract.detail, { handler: async c => c.json(okBody(await getCmsContentCollection(c.req.valid('param').id)), 200) }),
  defineContractRoute(contract.create, { handler: async c => c.json(okBody(await saveCmsContentCollection(undefined, c.req.valid('json'))), 200) }),
  defineContractRoute(contract.update, { handler: async c => c.json(okBody(await saveCmsContentCollection(c.req.valid('param').id, c.req.valid('json'))), 200) }),
  defineContractRoute(contract.remove, { handler: async c => { await removeCmsContentCollection(c.req.valid('param').id); return c.json(okBody(null), 200); } }),
  defineContractRoute(contract.preview, { handler: async c => c.json(okBody(await previewCmsCollection(c.req.valid('param').id)), 200) }),
  defineContractRoute(contract.versions, { handler: async c => c.json(okBody(await cmsCollectionVersions(c.req.valid('param').id)), 200) }),
]);
export default router;
