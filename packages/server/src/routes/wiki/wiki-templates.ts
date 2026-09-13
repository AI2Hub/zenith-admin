import { OpenAPIHono } from '@hono/zod-openapi';
import { wikiTemplateContract } from '@zenith/shared/wiki';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  createWikiTemplate,
  deleteWikiTemplate,
  getWikiTemplate,
  listAllWikiTemplates,
  listWikiTemplates,
  updateWikiTemplate,
} from '../../services/wiki/templates.service';
import { mountCrud } from '../_crud';

const templatesRouter = new OpenAPIHono({ defaultHook: validationHook });

const allRoute = defineContractRoute(wikiTemplateContract.all, {
  middleware: [authMiddleware, guard({ permission: 'wiki:doc:list' })],
  handler: async (c) => c.json(okBody(await listAllWikiTemplates()), 200),
});

mountCrud(templatesRouter, wikiTemplateContract,
  {
    list: listWikiTemplates,
    get: getWikiTemplate,
    create: createWikiTemplate,
    update: updateWikiTemplate,
    remove: deleteWikiTemplate,
  },
  {
    permission: { read: 'wiki:template:list', create: 'wiki:template:create', update: 'wiki:template:edit', remove: 'wiki:template:delete' },
    label: '文档模板',
    module: '知识中心',
  },
  [allRoute],
);

export default templatesRouter;
