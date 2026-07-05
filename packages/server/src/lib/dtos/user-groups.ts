/**
 * 用户组相关 DTO
 */
import { z } from '@hono/zod-openapi';
import { auditFields } from './_audit';

export const UserGroupMemberPreviewDTO = z
  .object({
    id: z.number().int(),
    nickname: z.string(),
    avatar: z.string().nullable().optional(),
  });

export const UserGroupDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '研发部审批组' }),
    code: z.string().openapi({ example: 'rd_approver' }),
    description: z.string().nullable().optional(),
    ownerId: z.number().int().nullable().optional(),
    ownerName: z.string().nullable().optional(),
    departmentId: z.number().int().nullable().optional(),
    departmentName: z.string().nullable().optional(),
    memberCount: z.number().int().openapi({ example: 5 }),
    memberPreview: z.array(UserGroupMemberPreviewDTO).optional(),
    roleCount: z.number().int().optional().openapi({ description: '绑定的角色数量' }),
    status: z.enum(['enabled', 'disabled']),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('UserGroup');

export const UserGroupMemberDTO = z
  .object({
    id: z.number().int(),
    username: z.string(),
    nickname: z.string(),
    email: z.string().nullable().optional(),
    departmentName: z.string().nullable().optional(),
    joinedAt: z.string(),
  })
  .openapi('UserGroupMember');

export const UserGroupRoleDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    code: z.string(),
    status: z.enum(['enabled', 'disabled']),
  })
  .openapi('UserGroupRole');
