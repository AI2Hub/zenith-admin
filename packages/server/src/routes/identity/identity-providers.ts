import { OpenAPIHono } from '@hono/zod-openapi';
import { identityProviderContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  createIdentityProvider,
  deleteIdentityProvider,
  getIdentityProvider,
  listIdentityProviders,
  searchIdentityProviderUsers,
  syncIdentityProviderUsers,
  testIdentityProviderConnection,
  updateIdentityProvider,
} from '../../services/identity/identity-providers.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const permission = 'system:identity-provider:manage';
const manage = [authMiddleware, guard({ permission })] as const;

const testConnectionRoute = defineContractRoute(identityProviderContract.test, {
  middleware: manage,
  handler: async (c) => c.json(okBody(await testIdentityProviderConnection(c.req.valid('param').id)), 200),
});

const searchDirectoryUsersRoute = defineContractRoute(identityProviderContract.ldapUsers, {
  middleware: manage,
  handler: async (c) => c.json(okBody(await searchIdentityProviderUsers(c.req.valid('param').id, c.req.valid('query'))), 200),
});

const syncDirectoryUsersRoute = defineContractRoute(identityProviderContract.sync, {
  middleware: [authMiddleware, guard({ permission, audit: { module: '企业身份源', description: '同步目录用户' } })] as const,
  handler: async (c) => c.json(okBody(await syncIdentityProviderUsers(c.req.valid('param').id, c.req.valid('json')), '同步完成'), 200),
});

mountCrud(router, identityProviderContract,
  {
    list: listIdentityProviders,
    get: getIdentityProvider,
    create: createIdentityProvider,
    update: updateIdentityProvider,
    remove: deleteIdentityProvider,
  },
  { permission: { read: permission, write: permission }, label: '企业身份源', module: '企业身份源' },
  [testConnectionRoute, searchDirectoryUsersRoute, syncDirectoryUsersRoute],
);

export default router;
