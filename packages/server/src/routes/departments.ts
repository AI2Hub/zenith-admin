import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { asc, eq, and } from 'drizzle-orm';
import { db } from '../db';
import { departments, users } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { exportToExcel } from '../lib/excel-export';
import { createDepartmentSchema, updateDepartmentSchema } from '@zenith/shared';
import { tenantCondition, getCreateTenantId } from '../lib/tenant';
import { ErrorResponse, jsonContent, validationHook, commonErrorResponses, ok, okMsg, IdParam, okBody, errBody, okExcel, excelBody } from '../lib/openapi-schemas';
import { DepartmentDTO } from '../lib/openapi-dtos';
import { mapDepartment, buildDepartmentTree, filterDepartmentTree, ensureParentValid } from '../services/departments.service';

const departmentsRouter = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['Departments'],
    summary: '部门树',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:department:list' })] as const,
    request: { query: z.object({ keyword: z.string().optional(), status: z.string().optional() }) },
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(DepartmentDTO), '部门树'),
    },
  }),
  handler: async (c) => {
    const { keyword = '', status } = c.req.valid('query');
    const user = c.get('user');
    const tc = tenantCondition(departments, user);
    const rows = await db.select().from(departments).where(tc).orderBy(asc(departments.sort), asc(departments.id));
    const tree = buildDepartmentTree(rows.map(mapDepartment));
    const data = keyword || status ? filterDepartmentTree(tree, keyword, status) : tree;
    return c.json(okBody(data), 200);
  },
});

const flatRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/flat',
    tags: ['Departments'],
    summary: '部门扁平列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:department:list' })] as const,
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(DepartmentDTO), '列表'),
    },
  }),
  handler: async (c) => {
    const tc = tenantCondition(departments, c.get('user'));
    const rows = await db.select().from(departments).where(tc).orderBy(asc(departments.sort), asc(departments.id));
    return c.json(okBody(rows.map(mapDepartment)), 200);
  },
});

const createRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/',
    tags: ['Departments'],
    summary: '创建部门',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:department:create', audit: { description: '创建部门', module: '部门管理' } })] as const,
    request: { body: { content: jsonContent(createDepartmentSchema), required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(DepartmentDTO, '创建成功'),
      400: { content: jsonContent(ErrorResponse), description: '参数错误' },
    },
  }),
  handler: async (c) => {
    const data = c.req.valid('json');
    await ensureParentValid(data.parentId);
    try {
      const [department] = await db.insert(departments).values({ ...data, tenantId: getCreateTenantId(c.get('user')) }).returning();
      return c.json(okBody(mapDepartment(department), '创建成功'), 200);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        return c.json(errBody('部门编码已存在'), 400);
      }
      throw error;
    }
  },
});

const updateRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Departments'],
    summary: '更新部门',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:department:update', audit: { description: '更新部门', module: '部门管理' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateDepartmentSchema), required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(DepartmentDTO, '更新成功'),
      400: { content: jsonContent(ErrorResponse), description: '参数错误' },
      404: { content: jsonContent(ErrorResponse), description: '不存在' },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    if (data.parentId !== undefined) {
      await ensureParentValid(data.parentId, id);
    }
    try {
      const [department] = await db.update(departments)
        .set({ ...data })
        .where(and(eq(departments.id, id), tenantCondition(departments, c.get('user'))))
        .returning();
      if (!department) return c.json(errBody('部门不存在', 404), 404);
      return c.json(okBody(mapDepartment(department), '更新成功'), 200);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        return c.json(errBody('部门编码已存在'), 400);
      }
      throw error;
    }
  },
});

const deleteRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Departments'],
    summary: '删除部门',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:department:delete', audit: { description: '删除部门', module: '部门管理' } })] as const,
    request: { params: IdParam },
    responses: {
      ...commonErrorResponses,
      ...okMsg('删除成功'),
      400: { content: jsonContent(ErrorResponse), description: '不可删除' },
      404: { content: jsonContent(ErrorResponse), description: '不存在' },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const tc = tenantCondition(departments, c.get('user'));
    const [department] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, id), tc)).limit(1);
    if (!department) return c.json(errBody('部门不存在', 404), 404);
    const [childDepartment] = await db.select({ id: departments.id }).from(departments).where(eq(departments.parentId, id)).limit(1);
    if (childDepartment) return c.json(errBody('该部门存在子部门，无法删除'), 400);
    const [boundUser] = await db.select({ id: users.id }).from(users).where(eq(users.departmentId, id)).limit(1);
    if (boundUser) return c.json(errBody('该部门下仍有关联用户，无法删除'), 400);
    await db.delete(departments).where(and(eq(departments.id, id), tc));
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const exportRouteDef = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/export',
    tags: ['Departments'],
    summary: '导出部门',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:department:list' })] as const,
    responses: {
      ...commonErrorResponses,
      ...okExcel('Excel 文件'),
    },
  }),
  handler: async (c) => {
    const tc = tenantCondition(departments, c.get('user'));
    const rows = await db.select().from(departments).where(tc).orderBy(asc(departments.sort));
    const buffer = await exportToExcel(
      [
        { header: 'ID', key: 'id', width: 8 },
        { header: '部门名称', key: 'name', width: 20 },
        { header: '部门编码', key: 'code', width: 16 },
        { header: '负责人', key: 'leader', width: 14 },
        { header: '电话', key: 'phone', width: 16 },
        { header: '状态', key: 'status', width: 10, transform: (v) => v === 'active' ? '启用' : '禁用' },
        { header: '创建时间', key: 'createdAt', width: 22 },
      ],
      rows.map((r) => ({ ...r, leader: r.leader ?? '', phone: r.phone ?? '', createdAt: r.createdAt.toISOString() })),
      '部门列表',
    );
    return excelBody(c, buffer, 'departments.xlsx');
  },
});

departmentsRouter.openapiRoutes([listRoute, flatRoute, createRouteDef, updateRouteDef, deleteRouteDef, exportRouteDef] as const);

export default departmentsRouter;
