import { OpenAPIHono } from '@hono/zod-openapi';
import { tenantContract } from '@zenith/shared/identity';
import { setAuditAfterData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listTenants,
  listAllTenants,
  getTenant,
  getTenantStats,
  createTenant,
  updateTenant,
  deleteTenant,
} from '../../services/identity/tenants.service';
import { mountCrud } from '../_crud';

const tenantsRoute = new OpenAPIHono({ defaultHook: validationHook });

const allRoute = defineContractRoute(tenantContract.all, {
  handler: async (c) => c.json(okBody(await listAllTenants()), 200),
});

const statsRoute = defineContractRoute(tenantContract.stats, {
  handler: async (c) => c.json(okBody(await getTenantStats(c.req.valid('param').id)), 200),
});

const createRouteDef = defineContractRoute(tenantContract.create, {
  // 契约审计 recordResponseBody: false — 创建响应可能含初始管理员一次性密码，不落审计日志
  handler: async (c) => {
    const created = await createTenant(c.req.valid('json'));
    // 审计快照剔除初始密码
    const { initialAdmin, ...tenantOnly } = created;
    setAuditAfterData(c, initialAdmin ? { ...tenantOnly, initialAdmin: { username: initialAdmin.username, email: initialAdmin.email } } : tenantOnly);
    return c.json(okBody(created, '创建成功'), 200);
  },
});

mountCrud(tenantsRoute, tenantContract,
  { list: listTenants, get: getTenant, update: updateTenant, remove: deleteTenant },
  {
    exclude: ['create'],
  },
  [allRoute, statsRoute, createRouteDef],
);

export default tenantsRoute;
