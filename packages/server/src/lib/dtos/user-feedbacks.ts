/**
 * 意见反馈 DTO
 */
import { z } from '@hono/zod-openapi';

export const UserFeedbackDTO = z
  .object({
    id: z.number().int(),
    userId: z.number().int(),
    userNickname: z.string().nullable(),
    score: z.number().int().min(1).max(5).nullable().openapi({ example: 5 }),
    category: z.enum(['suggestion', 'bug', 'ux', 'other']),
    content: z.string().nullable().openapi({ example: '希望增加深色模式的自动切换' }),
    pagePath: z.string().nullable().openapi({ example: '/system/users' }),
    status: z.enum(['pending', 'processing', 'resolved', 'ignored']),
    handleRemark: z.string().nullable(),
    handledBy: z.number().int().nullable(),
    handlerNickname: z.string().nullable(),
    handledAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('UserFeedback');
