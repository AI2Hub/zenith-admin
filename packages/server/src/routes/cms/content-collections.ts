import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsContentCollectionContract as contract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { mountCrud } from '../_crud';
import { allCmsContentCollections, cmsCollectionVersions, getCmsContentCollection, listCmsContentCollections, previewCmsCollection, removeCmsContentCollection, saveCmsContentCollection } from '../../services/cms/cms-content-collections.service';
const router = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(router, contract, {
  list: listCmsContentCollections, get: getCmsContentCollection,
  create: input => saveCmsContentCollection(undefined, input), update: saveCmsContentCollection, remove: removeCmsContentCollection,
}, {}, [
  defineContractRoute(contract.all, { handler: async c => c.json(okBody(await allCmsContentCollections(c.req.valid('query').siteId)), 200) }),
  defineContractRoute(contract.preview, { handler: async c => c.json(okBody(await previewCmsCollection(c.req.valid('param').id)), 200) }),
  defineContractRoute(contract.versions, { handler: async c => c.json(okBody(await cmsCollectionVersions(c.req.valid('param').id)), 200) }),
]);
export default router;
