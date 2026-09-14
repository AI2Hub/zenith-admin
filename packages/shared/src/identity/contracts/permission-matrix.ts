import * as z from 'zod';
import { entityStatusSchema, idParam } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';

// ─── 实体 ────────────────────────────────────────────────────────────────────

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
 * 接口权限矩阵数据面：目录（哪个接口要哪些权限）由契约 `access` 在前端直接派生（接口目录页），这里只提供
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
