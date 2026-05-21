/**
 * 公告相关 DTO
 */
import { z } from '@hono/zod-openapi';
import { auditFields } from './_audit';

export const AnnouncementDTO = z
  .object({
    id: z.number().int(),
    title: z.string().openapi({ example: '系统维护公告' }),
    content: z.string(),
    type: z.string().openapi({ example: 'notice' }),
    publishStatus: z.string().openapi({ example: 'published' }),
    priority: z.string().openapi({ example: 'medium' }),
    targetType: z.enum(['all', 'specific']),
    publishTime: z.string().nullable(),
    createById: z.number().int().nullable(),
    createByName: z.string().nullable(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
    readCount: z.number().int().optional(),
  })
  .openapi('Announcement');

export const AnnouncementReadStatsDTO = z
  .object({
    readCount: z.number().int(),
    totalCount: z.number().int(),
    list: z.array(
      z.object({
        id: z.number().int(),
        username: z.string(),
        nickname: z.string(),
        avatar: z.string().nullable(),
        readAt: z.string().optional(),
      }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .openapi('AnnouncementReadStats');
