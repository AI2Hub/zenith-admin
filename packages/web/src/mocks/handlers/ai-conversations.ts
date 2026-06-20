import { http, HttpResponse } from 'msw';
import { mockAiConversations, mockAiMessages, getNextConvId, getNextMsgId, mockAiDateTime as mockDateTime } from '@/mocks/data/ai';
import type { AiConversation, AiMessage } from '@zenith/shared';

const convStore: AiConversation[] = [...mockAiConversations];
const msgStore: Record<number, AiMessage[]> = { ...mockAiMessages };

export const aiConversationsHandlers = [
  // 列表
  http.get('/api/ai/conversations', () => {
    const sorted = [...convStore].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return HttpResponse.json({ code: 0, message: 'ok', data: sorted });
  }),

  // 创建对话
  http.post('/api/ai/conversations', async ({ request }) => {
    const body = await request.json() as { title?: string };
    const now = mockDateTime();
    const newConv: AiConversation = {
      id: getNextConvId(),
      userId: 1,
      tenantId: null,
      title: body.title ?? '新对话',
      providerSnapshot: null,
      isArchived: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };
    convStore.unshift(newConv);
    msgStore[newConv.id] = [];
    return HttpResponse.json({ code: 0, message: '创建成功', data: newConv });
  }),

  // 获取单条对话
  http.get('/api/ai/conversations/:id', ({ params }) => {
    const id = Number(params.id);
    const conv = convStore.find((c) => c.id === id);
    if (!conv) return HttpResponse.json({ code: 404, message: '对话不存在', data: null }, { status: 404 });
    return HttpResponse.json({ code: 0, message: 'ok', data: conv });
  }),

  // 删除对话
  http.delete('/api/ai/conversations/:id', ({ params }) => {
    const id = Number(params.id);
    const idx = convStore.findIndex((c) => c.id === id);
    if (idx === -1) return HttpResponse.json({ code: 404, message: '对话不存在', data: null }, { status: 404 });
    convStore.splice(idx, 1);
    delete msgStore[id];
    return HttpResponse.json({ code: 0, message: '删除成功', data: null });
  }),

  // 获取消息列表
  http.get('/api/ai/conversations/:id/messages', ({ params }) => {
    const id = Number(params.id);
    const msgs = msgStore[id] ?? [];
    return HttpResponse.json({ code: 0, message: 'ok', data: msgs });
  }),

  // SSE 聊天 (模拟流式响应)
  http.post('/api/ai/conversations/:id/chat', async ({ params, request }) => {
    const id = Number(params.id);
    const body = await request.json() as { message?: string };
    const userText = body.message ?? '';

    // Save user message
    const now = mockDateTime();
    const userMsg: AiMessage = {
      id: getNextMsgId(),
      conversationId: id,
      role: 'user',
      content: userText,
      tokensInput: Math.floor(userText.length / 4),
      tokensOutput: 0,
      feedback: null,
      createdAt: now,
    };
    if (!msgStore[id]) msgStore[id] = [];
    msgStore[id].push(userMsg);

    const replyText = `这是一个 Demo 演示模式的模拟回复。

您发送的消息是：**"${userText}"**

在真实环境中，这里会通过后端接入 AI 服务（如 OpenAI、DeepSeek 等），返回流式 SSE 响应。当前演示模式使用 MSW 模拟了 SSE 流式输出效果。

**当前时间：** ${now}`;

    const assistantMsgId = getNextMsgId();

    // Update conversation title if still default
    const conv = convStore.find((c) => c.id === id);
    if (conv?.title === '新对话') {
      conv.title = userText.slice(0, 20) + (userText.length > 20 ? '…' : '');
      conv.updatedAt = now;
    }

    // Build SSE response
    const chunks = replyText.match(/.{1,8}/g) ?? [];
    let sseBody = '';
    for (const chunk of chunks) {
      sseBody += `event: delta\ndata: ${JSON.stringify({ content: chunk })}\n\n`;
    }
    sseBody += `event: done\ndata: ${JSON.stringify({ tokensInput: Math.floor(userText.length / 4), tokensOutput: Math.floor(replyText.length / 4) })}\n\n`;

    // Save assistant message
    const assistantMsg: AiMessage = {
      id: assistantMsgId,
      conversationId: id,
      role: 'assistant',
      content: replyText,
      tokensInput: 0,
      tokensOutput: Math.floor(replyText.length / 4),
      feedback: null,
      createdAt: now,
    };
    msgStore[id].push(assistantMsg);

    return new HttpResponse(sseBody, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }),

  // ── 管理员反馈列表（/api/ai/conversations/admin/feedback）────────────────
  // 注意：必须在 /:id 路由之前注册，以避免 "admin" 被当成 id
  http.get('/api/ai/conversations/admin/feedback', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10;
    const feedbackParam = url.searchParams.get('feedback');

    // 收集所有带反馈的消息
    let allMsgs: AiMessage[] = Object.values(msgStore).flat().filter((m) => m.feedback !== null);
    if (feedbackParam !== null && feedbackParam !== '') {
      const fb = Number(feedbackParam);
      allMsgs = allMsgs.filter((m) => m.feedback === fb);
    }

    const total = allMsgs.length;
    const list = allMsgs.slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),

  // 消息反馈（点赞/点踩）
  http.post('/api/ai/conversations/:convId/messages/:msgId/feedback', async ({ params, request }) => {
    const convId = Number(params.convId);
    const msgId = Number(params.msgId);
    const body = await request.json() as { feedback: number | null };
    const msgs = msgStore[convId];
    if (!msgs) return HttpResponse.json({ code: 404, message: '对话不存在', data: null }, { status: 404 });
    const msg = msgs.find((m) => m.id === msgId);
    if (!msg) return HttpResponse.json({ code: 404, message: '消息不存在', data: null }, { status: 404 });
    msg.feedback = body.feedback ?? null;
    return HttpResponse.json({ code: 0, message: 'ok', data: msg });
  }),
];
