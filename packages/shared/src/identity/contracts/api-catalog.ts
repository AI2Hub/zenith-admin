import * as z from 'zod';
import { entityStatusSchema, idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { ACCESS_KINDS, SECURITY_SCHEMES } from '../../permission-catalog-core';

// ─── 接口目录 ────────────────────────────────────────────────────────────────

/** 后台登录令牌操作的访问要求（与 `OperationAccess` 同形：'authenticated' 或权限码 / 平台限定对象） */
export const operationAccessSchema = z.union([
  z.literal('authenticated'),
  z.object({
    permission: z.union([z.string(), z.array(z.string())]).optional(),
    platformOnly: z.union([z.literal(true), z.literal('multi-tenant')]).optional(),
  }),
]).meta({ id: 'OperationAccess' });

/** 目录里的一个接口：全部凭证类型都收录；只有后台登录令牌操作带访问要求 */
export const apiCatalogItemSchema = z.object({
  domain: z.string().meta({ example: 'identity' }),
  domainLabel: z.string().meta({ example: '身份与组织' }),
  basePath: z.string().meta({ example: '/api/users' }),
  name: z.string().meta({ description: '契约操作名', example: 'list' }),
  method: z.enum(['get', 'post', 'put', 'patch', 'delete']),
  fullPath: z.string().meta({ example: '/api/users/{id}' }),
  summary: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  deprecated: z.boolean(),
  security: z.enum(SECURITY_SCHEMES),
  access: operationAccessSchema.nullable().meta({ description: '后台登录令牌操作必有；其它凭证为 null' }),
  accessKind: z.enum(ACCESS_KINDS).nullable(),
  permissions: z.array(z.string()).meta({ description: '任一即可的权限码；登录即可 / 仅平台超管 / 非登录令牌 → 空' }),
  platformOnly: z.union([z.literal(false), z.literal(true), z.literal('multi-tenant')]),
  audit: z.string().nullable().meta({ description: '审计描述；不记审计为 null' }),
  feature: z.string().nullable().meta({ description: 'License 功能门控' }),
}).meta({ id: 'ApiCatalogItem' });

export type ApiCatalogItem = z.infer<typeof apiCatalogItemSchema>;

export const apiCatalogSchema = z.object({
  items: z.array(apiCatalogItemSchema),
  /** 目录引用到的权限码 → 注册表登记的按钮名 */
  permissionLabels: z.record(z.string(), z.string()),
}).meta({ id: 'ApiCatalog' });

export type ApiCatalog = z.infer<typeof apiCatalogSchema>;

/**
 * 接口目录：由服务端从契约派生（前端不直接 import 契约聚合——那会把全部域契约拉进共享分包）。
 * 目录只随发布变化，客户端可长期缓存。
 */
export const apiCatalogContract = defineContract('/api/api-catalog', {
  get: op.get('/', {
    access: { permission: 'system:api-catalog:view' },
    response: apiCatalogSchema,
    summary: '接口目录：全部契约操作的地址 / 方法 / 认证 / 权限码 / 审计 / 功能门控',
  }),
}, { tags: ['ApiCatalog'] });

// ─── 权限矩阵 ────────────────────────────────────────────────────────────────

/** 一个角色生效的权限码集合：角色绑定的启用按钮菜单 → permission，经租户套餐功能集过滤 */
export const rolePermissionSetSchema = z.object({
  id: z.int().meta({ example: 1 }),
  name: z.string().meta({ example: '运营专员' }),
  code: z.string().meta({ example: 'operator' }),
  status: entityStatusSchema,
  tenantId: z.int().nullable(),
  superAdmin: z.boolean().meta({ description: '平台超管角色（super_admin 且归属平台）：全部接口放行' }),
  permissions: z.array(z.string()).meta({ description: '生效的权限码（已去重）' }),
}).meta({ id: 'RolePermissionSet' });

export type RolePermissionSet = z.infer<typeof rolePermissionSetSchema>;

/** 一个用户生效的权限码集合：角色 + 直授菜单 + 用户组角色合并，与登录态下发的口径一致 */
export const userPermissionSetSchema = z.object({
  userId: z.int(),
  username: z.string(),
  nickname: z.string(),
  status: entityStatusSchema,
  tenantId: z.int().nullable(),
  superAdmin: z.boolean(),
  roles: z.array(z.object({ id: z.int(), name: z.string(), code: z.string() })),
  permissions: z.array(z.string()),
}).meta({ id: 'UserPermissionSet' });

export type UserPermissionSet = z.infer<typeof userPermissionSetSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

/**
 * 权限矩阵数据面：目录（哪个接口要哪些权限）由 `apiCatalogContract` 提供，这里只提供
 * 「主体持有哪些权限码」两个只读端点；不落任何新表。
 */
export const permissionMatrixContract = defineContract('/api/permission-matrix', {
  roles: op.get('/roles', {
    access: { permission: 'system:api-catalog:view' },
    response: z.array(rolePermissionSetSchema),
    summary: '各角色生效的权限码（当前租户视角）',
  }),
  user: op.get('/users/{id}', {
    access: { permission: 'system:api-catalog:view' },
    params: idParam,
    response: userPermissionSetSchema,
    summary: '用户生效的权限码（角色 / 直授 / 用户组合并）',
  }),
}, { tags: ['PermissionMatrix'] });
