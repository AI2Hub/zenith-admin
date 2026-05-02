import { http, HttpResponse } from 'msw';
import type { ChatMessage } from '@zenith/shared';
import {
  mockChatConversations, mockChatUsers, getMockConvMessages,
  addMockMessage, getNextMsgId, mockChatMessages,
} from '@/mocks/data/chat';
import { mockDateTime } from '@/mocks/utils/date';

// 当前 demo 用户 ID（对应 admin = 1）
const CURRENT_USER_ID = 1;
const CURRENT_USER_NICKNAME = '管理员';

export const chatHandlers = [
  // 可聊天用户搜索
  http.get('/api/chat/users', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const filtered = keyword
      ? mockChatUsers.filter((u) =>
          u.nickname.includes(keyword) || u.username.includes(keyword),
        )
      : mockChatUsers;
    return HttpResponse.json({ code: 0, message: 'ok', data: filtered });
  }),

  // 会话列表
  http.get('/api/chat/conversations', () => {
    return HttpResponse.json({ code: 0, message: 'ok', data: mockChatConversations });
  }),

  // 创建/获取单聊
  http.post('/api/chat/conversations/direct', async ({ request }) => {
    const body = await request.json() as { targetUserId: number };
    const targetUser = mockChatUsers.find((u) => u.id === body.targetUserId);
    if (!targetUser) return HttpResponse.json({ code: 404, message: '用户不存在', data: null }, { status: 404 });

    const existing = mockChatConversations.find(
      (c) => c.type === 'direct' && c.targetUser?.id === body.targetUserId,
    );
    if (existing) return HttpResponse.json({ code: 0, message: 'ok', data: existing });

    const newConv = {
      id: mockChatConversations.length + 100,
      type: 'direct' as const,
      name: null,
      targetUser,
      lastMessage: null,
      unreadCount: 0,
      createdAt: mockDateTime(),
      updatedAt: mockDateTime(),
    };
    mockChatConversations.unshift(newConv);
    return HttpResponse.json({ code: 0, message: 'ok', data: newConv });
  }),

  // 消息列表（分页，最新在前）
  http.get('/api/chat/conversations/:id/messages', ({ params, request }) => {
    const convId = Number(params.id);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '30');

    const all = getMockConvMessages(convId).slice().reverse(); // 最新在前
    const total = all.length;
    const start = (page - 1) * pageSize;
    const list = all.slice(start, start + pageSize);

    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),

  // 发送消息
  http.post('/api/chat/conversations/:id/messages', async ({ params, request }) => {
    const convId = Number(params.id);
    const body = await request.json() as { content: string; type?: string; replyToId?: number };

    const newMsg: ChatMessage = {
      id: getNextMsgId(),
      conversationId: convId,
      senderId: CURRENT_USER_ID,
      senderName: CURRENT_USER_NICKNAME,
      senderAvatar: null,
      type: (body.type ?? 'text') as ChatMessage['type'],
      content: body.content,
      replyToId: body.replyToId ?? null,
      isRecalled: false,
      extra: null,
      createdAt: mockDateTime(),
      updatedAt: mockDateTime(),
    };

    addMockMessage(newMsg);
    return HttpResponse.json({ code: 0, message: 'ok', data: newMsg });
  }),

  // 撤回消息
  http.patch('/api/chat/messages/:id/recall', ({ params }) => {
    const msgId = Number(params.id);
    const msg = mockChatMessages.find((m) => m.id === msgId);
    if (!msg) return HttpResponse.json({ code: 404, message: '消息不存在', data: null }, { status: 404 });
    if (msg.senderId !== CURRENT_USER_ID) {
      return HttpResponse.json({ code: 403, message: '只能撤回自己的消息', data: null }, { status: 403 });
    }
    msg.isRecalled = true;
    msg.content = '消息已撤回';
    return HttpResponse.json({ code: 0, message: 'ok', data: null });
  }),

  // 标记已读
  http.post('/api/chat/conversations/:id/read', ({ params }) => {
    const convId = Number(params.id);
    const conv = mockChatConversations.find((c) => c.id === convId);
    if (conv) conv.unreadCount = 0;
    return HttpResponse.json({ code: 0, message: 'ok', data: null });
  }),
];
