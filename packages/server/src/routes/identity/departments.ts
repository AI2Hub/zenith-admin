import { OpenAPIHono } from '@hono/zod-openapi';
import { departmentContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { defineScopeMembersRoute } from './_scope-members';
import {
  listDepartmentTree,
  listDepartmentsFlat,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartment,
} from '../../services/identity/departments.service';
import { mountCrud } from '../_crud';

const memberPreviewRoute = defineScopeMembersRoute({
  op: departmentContract.memberPreview,
  scopeType: 'department',
  permission: 'system:department:list',
});

const departmentsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'system:department:list' })] as const;

const listRoute = defineContractRoute(departmentContract.tree, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listDepartmentTree(c.req.valid('query'))), 200),
});

const flatRoute = defineContractRoute(departmentContract.flat, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listDepartmentsFlat()), 200),
});

mountCrud(departmentsRouter, departmentContract,
  { get: getDepartment, create: createDepartment, update: updateDepartment, remove: deleteDepartment },
  { permission: 'system:department', label: '部门' },
  [listRoute, flatRoute, memberPreviewRoute],
);

export default departmentsRouter;
