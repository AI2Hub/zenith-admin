import { OpenAPIHono } from '@hono/zod-openapi';
import { tenantPackageContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { platformAdminOnly } from '../../middleware/platform-admin';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listTenantPackages,
  listAllTenantPackages,
  getTenantPackage,
  createTenantPackage,
  updateTenantPackage,
  deleteTenantPackage,
  batchDeleteTenantPackages,
  assignTenantPackageFeatures,
  getTenantPackageBeforeAudit,
  getTenantPackagesBeforeAudit,
} from '../../services/identity/tenant-packages.service';
import { mountCrud } from '../_crud';

const tenantPackagesRoute = new OpenAPIHono({ defaultHook: validationHook });

const admin = [authMiddleware, platformAdminOnly({ message: '仅平台管理员可管理租户套餐' })] as const;

const allRoute = defineContractRoute(tenantPackageContract.all, {
  middleware: admin,
  handler: async (c) => c.json(okBody(await listAllTenantPackages()), 200),
});

const assignFeaturesRouteDef = defineContractRoute(tenantPackageContract.assignFeatures, {
  middleware: [...admin, guard({ audit: { module: '租户套餐', description: '分配套餐功能' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { features } = c.req.valid('json');
    const before = await getTenantPackageBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await assignTenantPackageFeatures(id, features);
    const after = await getTenantPackageBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '功能已更新'), 200);
  },
});

const batchDeleteRouteDef = defineContractRoute(tenantPackageContract.removeBatch, {
  middleware: [...admin, guard({ audit: { module: '租户套餐', description: '批量删除套餐' } })],
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const before = await getTenantPackagesBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const count = await batchDeleteTenantPackages(ids);
    return c.json(okBody(null, `已删除 ${count} 条记录`), 200);
  },
});

// DELETE /batch 必须先于 DELETE /{id} 注册，否则 "batch" 会被当成 id
mountCrud(tenantPackagesRoute, tenantPackageContract,
  {
    list: listTenantPackages,
    get: getTenantPackage,
    create: createTenantPackage,
    update: updateTenantPackage,
    remove: deleteTenantPackage,
  },
  {
    permission: null,
    label: '套餐',
    module: '租户套餐',
    middleware: [platformAdminOnly({ message: '仅平台管理员可管理租户套餐' })],
    exclude: ['removeBatch'],
  },
  [allRoute, assignFeaturesRouteDef, batchDeleteRouteDef],
);

export default tenantPackagesRoute;
