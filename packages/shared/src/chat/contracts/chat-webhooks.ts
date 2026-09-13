import * as z from 'zod';
import { idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { chatWebhookPayloadSchema, createChatWebhookSchema, updateChatWebhookSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 聊天入站 Webhook 机器人 */
export const chatWebhookSchema = z.object({
  id: z.int(),
  name: z.string(),
  avatar: z.string().nullable(),
  description: z.string().nullable(),
  conversationId: z.int(),
  conversationName: z.string().nullable(),
  enabled: z.boolean(),
  webhookUrl: z.string().meta({ description: '完整入站推送地址' }),
  token: z.string().meta({ description: '令牌（仅创建/重置时返回明文，列表中为脱敏）' }),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ChatWebhook' });

export type ChatWebhook = z.infer<typeof chatWebhookSchema>;

// ─── 契约：后台管理 ──────────────────────────────────────────────────────────

export const chatBotListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称'),
});

export const chatBotContract = defineContract('/api/chat-bots', {
  list: op.get('/', { query: chatBotListQuery, response: paginated(chatWebhookSchema), summary: '获取 Webhook 机器人列表' }),
  create: op.post('/', { body: createChatWebhookSchema, response: chatWebhookSchema, summary: '创建 Webhook 机器人' }),
  update: op.patch('/{id}', { params: idParam, body: updateChatWebhookSchema, response: chatWebhookSchema, summary: '更新 Webhook 机器人' }),
  regenerateToken: op.post('/{id}/regenerate-token', { params: idParam, response: chatWebhookSchema, summary: '重置 Webhook 令牌' }),
  remove: op.delete('/{id}', { params: idParam, summary: '删除 Webhook 机器人' }),
}, { tags: ['ChatBots'] });

// ─── 契约：入站推送（公开，由外部系统以令牌调用） ─────────────────────────────

export const chatWebhookTokenParam = z.object({
  token: z.string().min(8).max(128).meta({ description: 'Webhook 令牌', example: 'cwh_xxxxxxxx' }),
});

export const chatWebhookPublicContract = defineContract('/api/public/chat/webhook', {
  ingest: op.post('/{token}', {
    params: chatWebhookTokenParam,
    body: chatWebhookPayloadSchema,
    public: true,
    summary: '入站 Webhook 推送消息（公开，无需登录，由外部系统调用）',
    description: '令牌在路由处理内校验；命中后以 webhook 身份向其目标会话投递一条文本或卡片消息。',
  }),
}, { tags: ['聊天 Webhook（公开）'] });
