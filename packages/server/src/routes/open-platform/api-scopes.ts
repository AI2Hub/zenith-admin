import { OpenAPIHono } from '@hono/zod-openapi';
import { apiScopeContract } from '@zenith/shared/open-platform';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listApiScopes,
  listEnabledApiScopes,
  batchDeleteApiScopes,
  apiScopeService,
} from '../../services/open-platform/api-scopes.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const MODULE = '开放平台-API Scope';
const options = defineContractRoute(apiScopeContract.options, {
  middleware: [authMiddleware],
  handler: async (c) => c.json(okBody(await listEnabledApiScopes()), 200),
});
const batchDelete = defineContractRoute(apiScopeContract.removeBatch, {
  middleware: [authMiddleware, guard({ permission: 'open:scope:manage', audit: { description: '批量删除 API Scope', module: MODULE } })],
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const n = await batchDeleteApiScopes(ids);
    return c.json(okBody(null, `已删除 ${n} 条记录`), 200);
  },
});

mountCrud(router, apiScopeContract,
  {
    list: listApiScopes,
    get: apiScopeService.get,
    create: apiScopeService.create,
    update: apiScopeService.update,
    remove: apiScopeService.remove,
  },
  {
    permission: { read: 'open:scope:view', write: 'open:scope:manage' },
    label: ' API Scope',
    module: MODULE,
    exclude: ['removeBatch'],
  },
  [options, batchDelete],
);

export default router;
