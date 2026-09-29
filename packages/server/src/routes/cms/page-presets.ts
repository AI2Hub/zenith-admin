import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsPagePresetContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { setAuditBeforeData } from '../../middleware/guard';
import { mountCrud } from '../_crud';
import { copyCmsPagePreset, createCmsPagePreset, getCmsPagePreset, getCmsPagePresetVersion, instantiateCmsPagePreset, listCmsPagePresets, listCmsPagePresetUsages, listCmsPagePresetVersions, saveCmsPagePresetVersion } from '../../services/cms/cms-page-presets.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(router, cmsPagePresetContract, { list: listCmsPagePresets, get: getCmsPagePreset, create: createCmsPagePreset }, {}, [
  defineContractRoute(cmsPagePresetContract.versions, { handler: async c => c.json(okBody(await listCmsPagePresetVersions(c.req.valid('param').id)), 200) }),
  defineContractRoute(cmsPagePresetContract.version, { handler: async c => {
    const { id, version } = c.req.valid('param');
    return c.json(okBody(await getCmsPagePresetVersion(id, version)), 200);
  } }),
  defineContractRoute(cmsPagePresetContract.saveVersion, { handler: async c => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getCmsPagePreset(id));
    return c.json(okBody(await saveCmsPagePresetVersion(id, c.req.valid('json')), '已保存新版本，使用中的页面保持原快照'), 200);
  } }),
  defineContractRoute(cmsPagePresetContract.copy, { handler: async c => c.json(okBody(await copyCmsPagePreset(c.req.valid('param').id, c.req.valid('json')), '组合已复制'), 200) }),
  defineContractRoute(cmsPagePresetContract.usages, { handler: async c => c.json(okBody(await listCmsPagePresetUsages(c.req.valid('param').id)), 200) }),
  defineContractRoute(cmsPagePresetContract.instantiate, { handler: async c => c.json(okBody(await instantiateCmsPagePreset(c.req.valid('param').id, c.req.valid('json'))), 200) }),
]);
export default router;
