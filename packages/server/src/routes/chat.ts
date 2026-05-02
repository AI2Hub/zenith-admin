import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middleware/auth';
import {
  PaginationQuery, jsonContent, validationHook, commonErrorResponses,
  ok, okPaginated, okMsg, IdParam, okBody,
} from '../lib/openapi-schemas';
import { ChatMessageDTO, ChatConversationDTO, ChatUserDTO } from '../lib/openapi-dtos';
import {
  listConversations, getOrCreateDirectConversation, listMessages,
  sendMessage, recallMessage, markConversationRead, listChatUsers,
} from '../services/chat.service';

const chatRouter = new OpenAPIHono({ defaultHook: validationHook });

// ─── 用户搜索（开始聊天前选对象） ────────────────────────────────────────────

chatRouter.openapi(
  createRoute({
    method: 'get', path: '/users', tags: ['Chat'], summary: '搜索可聊天的用户',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { query: z.object({ keyword: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...ok(z.array(ChatUserDTO), '用户列表') },
  }),
  async (c) => {
    const { keyword } = c.req.valid('query');
    const list = await listChatUsers(keyword);
    return c.json(okBody(list), 200);
  },
);

// ─── 会话列表 ─────────────────────────────────────────────────────────────────

chatRouter.openapi(
  createRoute({
    method: 'get', path: '/conversations', tags: ['Chat'], summary: '我的会话列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(ChatConversationDTO), '会话列表') },
  }),
  async (c) => {
    const list = await listConversations();
    return c.json(okBody(list), 200);
  },
);

// ─── 创建/获取单聊会话 ────────────────────────────────────────────────────────

chatRouter.openapi(
  createRoute({
    method: 'post', path: '/conversations/direct', tags: ['Chat'], summary: '创建或获取单聊会话',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { body: { content: jsonContent(z.object({ targetUserId: z.number().int().positive() })) } },
    responses: { ...commonErrorResponses, ...ok(ChatConversationDTO, '会话信息') },
  }),
  async (c) => {
    const { targetUserId } = c.req.valid('json');
    const conv = await getOrCreateDirectConversation(targetUserId);
    return c.json(okBody(conv), 200);
  },
);

// ─── 会话消息列表 ─────────────────────────────────────────────────────────────

chatRouter.openapi(
  createRoute({
    method: 'get', path: '/conversations/{id}/messages', tags: ['Chat'], summary: '获取会话消息（分页）',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam, query: PaginationQuery },
    responses: { ...commonErrorResponses, ...okPaginated(ChatMessageDTO, '消息列表') },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { page, pageSize } = c.req.valid('query');
    const result = await listMessages(id, page, pageSize);
    return c.json(okBody(result), 200);
  },
);

// ─── 发送消息 ─────────────────────────────────────────────────────────────────

const sendMessageSchema = z.object({
  content: z.string().min(1, '消息不能为空').max(4096),
  type: z.enum(['text', 'image', 'file']).default('text'),
  replyToId: z.number().int().positive().nullable().optional(),
  extra: z.record(z.string(), z.unknown()).nullable().optional(),
});

chatRouter.openapi(
  createRoute({
    method: 'post', path: '/conversations/{id}/messages', tags: ['Chat'], summary: '发送消息',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam, body: { content: jsonContent(sendMessageSchema) } },
    responses: { ...commonErrorResponses, ...ok(ChatMessageDTO, '消息') },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const msg = await sendMessage(id, body);
    return c.json(okBody(msg), 200);
  },
);

// ─── 撤回消息 ─────────────────────────────────────────────────────────────────

chatRouter.openapi(
  createRoute({
    method: 'patch', path: '/messages/{id}/recall', tags: ['Chat'], summary: '撤回消息',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('撤回成功') },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    await recallMessage(id);
    return c.json(okBody(null), 200);
  },
);

// ─── 标记已读 ─────────────────────────────────────────────────────────────────

chatRouter.openapi(
  createRoute({
    method: 'post', path: '/conversations/{id}/read', tags: ['Chat'], summary: '标记会话已读',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('已读') },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    await markConversationRead(id);
    return c.json(okBody(null), 200);
  },
);

export default chatRouter;
