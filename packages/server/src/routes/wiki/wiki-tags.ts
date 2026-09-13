import { OpenAPIHono } from '@hono/zod-openapi';
import { wikiTagContract } from '@zenith/shared/wiki';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  createWikiTag,
  deleteWikiTag,
  getWikiTag,
  listAllWikiTags,
  listWikiTags,
  updateWikiTag,
} from '../../services/wiki/tags.service';
import { mountCrud } from '../_crud';

const tagsRouter = new OpenAPIHono({ defaultHook: validationHook });
const allRoute = defineContractRoute(wikiTagContract.all, {
  middleware: [authMiddleware, guard({ permission: 'wiki:doc:list' })],
  handler: async (c) => c.json(okBody(await listAllWikiTags()), 200),
});

mountCrud(tagsRouter, wikiTagContract,
  {
    list: listWikiTags,
    get: getWikiTag,
    create: createWikiTag,
    update: updateWikiTag,
    remove: deleteWikiTag,
  },
  {
    permission: { read: 'wiki:tag:list', create: 'wiki:tag:create', update: 'wiki:tag:edit', remove: 'wiki:tag:delete' },
    label: '标签',
    module: '知识中心',
  },
  [allRoute],
);

export default tagsRouter;
