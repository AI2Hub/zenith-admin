import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsVocabularyContract } from '@zenith/shared/cms';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { mountCrud } from '../_crud';
import { allCmsVocabularies, cmsVocabularyService, getCmsVocabulary, listCmsVocabularies } from '../../services/cms/cms-vocabularies.service';
const router = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(router, cmsVocabularyContract, { ...cmsVocabularyService, get: getCmsVocabulary, list: listCmsVocabularies }, {}, [
  defineContractRoute(cmsVocabularyContract.all, { handler: async c => c.json(okBody(await allCmsVocabularies(c.req.valid('query').siteId)), 200) }),
]);
export default router;
