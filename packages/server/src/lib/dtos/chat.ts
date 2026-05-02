/**
 * 聊天 DTO
 */
import { z } from '@hono/zod-openapi';

export const ChatUserDTO = z
  .object({
    id: z.number().int(),
    nickname: z.string(),
    username: z.string(),
    avatar: z.string().nullable().optional(),
  })
  .openapi('ChatUser');

export const ChatMessageDTO = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    conversationId: z.number().int(),
    senderId: z.number().int().nullable(),
    senderName: z.string().nullable(),
    senderAvatar: z.string().nullable().optional(),
    type: z.enum(['text', 'image', 'file', 'system']),
    content: z.string(),
    replyToId: z.number().int().nullable().optional(),
    isRecalled: z.boolean(),
    extra: z.record(z.string(), z.unknown()).nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ChatMessage');

export const ChatConversationDTO = z
  .object({
    id: z.number().int(),
    type: z.enum(['direct', 'group']),
    name: z.string().nullable().optional(),
    targetUser: z
      .object({ id: z.number().int(), nickname: z.string(), avatar: z.string().nullable().optional() })
      .nullable()
      .optional(),
    lastMessage: ChatMessageDTO.nullable().optional(),
    unreadCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ChatConversation');
