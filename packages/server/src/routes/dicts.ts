import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { eq, asc, and, or, like, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { pageOffset } from '../lib/pagination';
import { dicts, dictItems } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { exportToExcel } from '../lib/excel-export';
import { tenantCondition, getCreateTenantId } from '../lib/tenant';
import { ErrorResponse, PaginationQuery, jsonContent, validationHook, commonErrorResponses, ok, okPaginated, okMsg, IdParam, okBody, errBody, okExcel, excelBody } from '../lib/openapi-schemas';
import { createDictSchema, updateDictSchema, createDictItemSchema, updateDictItemSchema } from '@zenith/shared';
import { DictDTO, DictItemDTO } from '../lib/openapi-dtos';
import { mapDict, mapDictItem } from '../services/dicts.service';

const dictsRouter = new OpenAPIHono({ defaultHook: validationHook });


// ─── 字典 CRUD ────────────────────────────────────────────────────────────────

const listDictsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['Dicts'],
    summary: '字典列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:dict:list' })] as const,
    request: {
      query: PaginationQuery.extend({
        keyword: z.string().optional(),
        status: z.enum(['active', 'disabled']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
    responses: {
      ...commonErrorResponses,
      ...okPaginated(DictDTO, '字典列表'),
    },
  }),
  handler: async (c) => {
    const { keyword = '', status = '', startDate = '', endDate = '', page, pageSize } = c.req.valid('query');
    const conditions = [];
    if (keyword) conditions.push(or(like(dicts.name, `%${keyword}%`), like(dicts.code, `%${keyword}%`)));
    if (status) conditions.push(eq(dicts.status, status));
    if (startDate) conditions.push(gte(dicts.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(dicts.createdAt, new Date(`${endDate}T23:59:59.999Z`)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const tc = tenantCondition(dicts, c.get('user'));
    const finalWhere = where && tc ? and(where, tc) : (tc ?? where);
    const [total, list] = await Promise.all([
      db.$count(dicts, finalWhere),
      db.select().from(dicts).where(finalWhere).orderBy(dicts.id).limit(pageSize).offset(pageOffset(page, pageSize)),
    ]);
    return c.json(okBody({ list: list.map(mapDict), total, page, pageSize }), 200);
  },
});

const createDictRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/',
    tags: ['Dicts'],
    summary: '创建字典',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      guard({ permission: 'system:dict:create', audit: { description: '创建字典', module: '字典管睆' } }),
    ] as const,
    request: { body: { content: jsonContent(createDictSchema), required: true } },
    responses: {
      ...commonErrorResponses,
      ...ok(DictDTO, '创建戝功'),
      400: { content: jsonContent(ErrorResponse), description: '字典编砝已存�? },
    },
  }),
  handler: async (c) => {
    const data = c.req.valid('json');
    try {
      const [dict] = await db
        .insert(dicts)
        .values({ ...data, tenantId: getCreateTenantId(c.get('user')) })
        .returning();
      return c.json(okBody(mapDict(dict), '创建戝功'), 200);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return c.json(errBody('字典编砝已存�?), 400);
      }
      throw err;
    }
  },
});

const updateDictRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/{id}',
    tags: ['Dicts'],
    summary: '更新字典',
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      guard({ permission: 'system:dict:update', audit: { description: '更新字典', module: '字典管睆' } }),
    ] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(updateDictSchema), required: true },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(DictDTO, '更新戝功'),
      404: { content: jsonContent(ErrorResponse), description: '字典丝存�? },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const [dict] = await db
      .update(dicts)
      .set({ ...data })
      .where(and(eq(dicts.id, id), tenantCondition(dicts, c.get('user'))))
      .returning();
    if (!dict) return c.json(errBody('字典丝存�?, 404), 404);
    return c.json(okBody(mapDict(dict), '更新戝功'), 200);
  },
});

const deleteDictRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Dicts'],
    summary: '删除字典',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:dict:delete', audit: { description: '删除字典', module: '字典管睆' } }),
    ] as const,
    request: { params: IdParam },
    responses: {
      ...commonErrorResponses,
      ...okMsg('删除戝功'),
      404: { content: jsonContent(ErrorResponse), description: '字典丝存�? },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const [deleted] = await db
      .delete(dicts)
      .where(and(eq(dicts.id, id), tenantCondition(dicts, c.get('user'))))
      .returning();
    if (!deleted) return c.json(errBody('字典丝存�?, 404), 404);
    return c.json(okBody(null, '删除戝功'), 200);
  },
});

// ─── 字典�?CRUD ────────────────────────────────────────────────────────────

const listItemsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/{id}/items',
    tags: ['Dicts'],
    summary: '获坖字典下所有字典项',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:dict:list' })] as const,
    request: { params: IdParam },
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(DictItemDTO), '字典项列�?),
    },
  }),
  handler: async (c) => {
    const { id: dictId } = c.req.valid('param');
    const items = await db
      .select()
      .from(dictItems)
      .where(eq(dictItems.dictId, dictId))
      .orderBy(asc(dictItems.sort), asc(dictItems.id));
    return c.json(okBody(items.map(mapDictItem)), 200);
  },
});

const getItemsByCodeRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/code/{code}/items',
    tags: ['Dicts'],
    summary: '通过字典编砝获坖字典项（供剝端使用）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: z.object({ code: z.string().openapi({ param: { name: 'code', in: 'path' }, example: 'sys_status', description: '字典编砝' }) }) },
    responses: {
      ...commonErrorResponses,
      ...ok(z.array(DictItemDTO), '字典项列�?),
      404: { content: jsonContent(ErrorResponse), description: '字典丝存�? },
    },
  }),
  handler: async (c) => {
    const { code } = c.req.valid('param');
    const [dict] = await db.select({ id: dicts.id }).from(dicts).where(eq(dicts.code, code)).limit(1);
    if (!dict) return c.json(errBody('字典丝存�?, 404), 404);
    const items = await db
      .select()
      .from(dictItems)
      .where(eq(dictItems.dictId, dict.id))
      .orderBy(asc(dictItems.sort));
    return c.json(okBody(items.map(mapDictItem)), 200);
  },
});

const createItemRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/{id}/items',
    tags: ['Dicts'],
    summary: '创建字典�?,
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      guard({ permission: 'system:dict:item', audit: { description: '创建字典�?, module: '字典管睆' } }),
    ] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(createDictItemSchema), required: true },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(DictItemDTO, '创建戝功'),
    },
  }),
  handler: async (c) => {
    const { id: dictId } = c.req.valid('param');
    const data = c.req.valid('json');
    const [item] = await db.insert(dictItems).values({ ...data, dictId }).returning();
    return c.json(okBody(mapDictItem(item), '创建戝功'), 200);
  },
});

const updateItemRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/{id}/items/{itemId}',
    tags: ['Dicts'],
    summary: '更新字典�?,
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      guard({ permission: 'system:dict:item', audit: { description: '更新字典�?, module: '字典管睆' } }),
    ] as const,
    request: {
      params: z.object({
        id: z.coerce.number().openapi({ param: { name: 'id', in: 'path' }, example: 1, description: '字典 ID' }),
        itemId: z.coerce.number().openapi({ param: { name: 'itemId', in: 'path' }, example: 1, description: '字典�?ID' }),
      }),
      body: { content: jsonContent(updateDictItemSchema), required: true },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(DictItemDTO, '更新戝功'),
      404: { content: jsonContent(ErrorResponse), description: '字典项丝存在' },
    },
  }),
  handler: async (c) => {
    const { itemId } = c.req.valid('param');
    const data = c.req.valid('json');
    const [item] = await db
      .update(dictItems)
      .set({ ...data })
      .where(eq(dictItems.id, itemId))
      .returning();
    if (!item) return c.json(errBody('字典项丝存在', 404), 404);
    return c.json(okBody(mapDictItem(item), '更新戝功'), 200);
  },
});

const deleteItemRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/{id}/items/{itemId}',
    tags: ['Dicts'],
    summary: '删除字典�?,
    security: [{ BearerAuth: [] }],
    middleware: [
      authMiddleware,
      guard({ permission: 'system:dict:item', audit: { description: '删除字典�?, module: '字典管睆' } }),
    ] as const,
    request: {
      params: z.object({
        id: z.coerce.number().openapi({ param: { name: 'id', in: 'path' }, example: 1, description: '字典 ID' }),
        itemId: z.coerce.number().openapi({ param: { name: 'itemId', in: 'path' }, example: 1, description: '字典�?ID' }),
      }),
    },
    responses: {
      ...commonErrorResponses,
      ...okMsg('删除戝功'),
      404: { content: jsonContent(ErrorResponse), description: '字典项丝存在' },
    },
  }),
  handler: async (c) => {
    const { itemId } = c.req.valid('param');
    const [deleted] = await db.delete(dictItems).where(eq(dictItems.id, itemId)).returning();
    if (!deleted) return c.json(errBody('字典项丝存在', 404), 404);
    return c.json(okBody(null, '删除戝功'), 200);
  },
});

const exportRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/export',
    tags: ['Dicts'],
    summary: '导出字典 Excel',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:dict:list' })] as const,
    responses: {
      ...commonErrorResponses,
      ...okExcel('Excel 文件'),
    },
  }),
  handler: async (c) => {
    const rows = await db
      .select()
      .from(dicts)
      .where(tenantCondition(dicts, c.get('user')))
      .orderBy(asc(dicts.id));
    const buffer = await exportToExcel(
      [
        { header: 'ID', key: 'id', width: 8 },
        { header: '字典坝称', key: 'name', width: 20 },
        { header: '字典编砝', key: 'code', width: 20 },
        { header: '备注', key: 'remark', width: 30 },
        { header: '状�?, key: 'status', width: 10, transform: (v) => (v === 'active' ? '坯用' : '禝用') },
        { header: '创建时间', key: 'createdAt', width: 22 },
      ],
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      '字典列表',
    );
    return excelBody(c, buffer, 'dicts.xlsx');
  },
});

dictsRouter.openapiRoutes([listDictsRoute, createDictRoute, updateDictRoute, deleteDictRoute, listItemsRoute, getItemsByCodeRoute, createItemRoute, updateItemRoute, deleteItemRoute, exportRoute] as const);

export default dictsRouter;
