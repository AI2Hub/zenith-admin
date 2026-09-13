import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsTagContract } from '@zenith/shared/cms';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listCmsTags,
  listAllCmsTags,
  getCmsTag,
  createCmsTag,
  updateCmsTag,
  deleteCmsTag,
} from '../../services/cms/cms-tags.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

// 内容打标下拉：按内容权限放行
const allRoute = defineContractRoute(cmsTagContract.all, {
  middleware: [authMiddleware, guard({ permission: 'cms:content:list' })],
  handler: async (c) => c.json(okBody(await listAllCmsTags(c.req.valid('query').siteId)), 200),
});

mountCrud(router, cmsTagContract,
  { list: listCmsTags, get: getCmsTag, create: createCmsTag, update: updateCmsTag, remove: deleteCmsTag },
  { permission: 'cms:tag', label: ' CMS 标签', module: 'CMS内容管理' },
  [allRoute],
);

export default router;
