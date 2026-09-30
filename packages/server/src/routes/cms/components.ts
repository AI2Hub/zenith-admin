import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsComponentContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { setAuditBeforeData } from '../../middleware/guard';
import {
  allCmsComponents, createCmsComponent, deleteCmsComponent, getCmsComponent, getCmsComponentImpact,
  listCmsComponents, listCmsComponentVersions, publishCmsComponent, updateCmsComponent,
} from '../../services/cms/cms-components.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(router, cmsComponentContract, {
  list: listCmsComponents, get: getCmsComponent, create: createCmsComponent,
  update: updateCmsComponent, remove: deleteCmsComponent,
}, {}, [
  defineContractRoute(cmsComponentContract.all, { handler: async c => c.json(okBody(await allCmsComponents(c.req.valid('query').siteId)), 200) }),
  defineContractRoute(cmsComponentContract.versions, { handler: async c => c.json(okBody(await listCmsComponentVersions(c.req.valid('param').id, c.req.valid('query').siteId)), 200) }),
  defineContractRoute(cmsComponentContract.impact, { handler: async c => c.json(okBody(await getCmsComponentImpact(c.req.valid('param').id, c.req.valid('query').siteId)), 200) }),
  defineContractRoute(cmsComponentContract.publish, { handler: async c => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getCmsComponent(id));
    return c.json(okBody(await publishCmsComponent(id, c.req.valid('json').expectedVersion, c.req.valid('query').siteId), '组件版本已发布'), 200);
  } }),
]);
export default router;
