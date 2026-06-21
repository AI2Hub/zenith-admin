/**
 * 租户相关 DTO
 */
import { z } from '@hono/zod-openapi';
import { auditFields } from './_audit';

export const TenantDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '示例租户' }),
    code: z.string().openapi({ example: 'demo' }),
    logo: z.string().nullable().optional(),
    contactName: z.string().nullable().optional(),
    contactPhone: z.string().nullable().optional(),
    status: z.enum(['enabled', 'disabled']),
    expireAt: z.string().nullable().optional(),
    maxUsers: z.number().int().nullable().optional(),
    packageId: z.number().int().nullable().optional(),
    packageName: z.string().nullable().optional(),
    remark: z.string().nullable().optional(),
    ...auditFields,
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi('Tenant');

export const TenantPackageDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '标准版' }),
    status: z.enum(['enabled', 'disabled']),
    remark: z.string().nullable().optional(),
    menuIds: z.array(z.number().int()).optional().openapi({ description: '关联的菜单 ID（详情返回）' }),
    menuCount: z.number().int().optional().openapi({ description: '已关联菜单数量（列表返回）' }),
    ...auditFields,
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi('TenantPackage');
