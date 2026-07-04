import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { authMiddleware } from '../../middleware/auth';
import { validationHook } from '../../lib/openapi-schemas';
import { ensureConversationOwner, getHistoryMessages, saveMessages, updateConversationTitle } from '../../services/ai/ai-conversations.service';
import { streamAiChat } from '../../services/ai/ai-chat.service';
import { z } from 'zod';

const router = new OpenAPIHono({ defaultHook: validationHook });

const SendMessageBody = z.object({
  message: z.string().min(1).max(8192),
  configSource: z.enum(['system', 'user']).optional(),
  configId: z.number().int().positive().optional(),
});

/**
 * POST /api/ai/conversations/:id/chat
 * SSE 流式对话接口 —— 不走 openapiRoutes，使用原生 Hono streamSSE
 */
router.post('/:id/chat', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) {
    return c.json({ code: 400, message: '无效的对话 ID', data: null }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ code: 400, message: '请求体格式错误', data: null }, 400);
  }

  const parsed = SendMessageBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ code: 400, message: '消息不能为空', data: null }, 400);
  }

  const { message, configSource, configId } = parsed.data;

  // 验证对话归属
  let conversation: Awaited<ReturnType<typeof ensureConversationOwner>>;
  try {
    conversation = await ensureConversationOwner(id);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 403;
    const msg = (err as { message?: string }).message ?? '无权访问此对话';
    return c.json({ code: status, message: msg, data: null }, status as 401 | 403 | 404);
  }

  return streamSSE(c, async (stream) => {
    let assistantContent = '';
    let tokensInput = 0;
    let tokensOutput = 0;
    let snapshot: { provider: string; model: string; configId?: number } | null = null;
    let aborted = false;

    // 客户端断开 / 主动停止生成时，中断上游 LLM 请求（节省 token）
    const ac = new AbortController();
    stream.onAbort(() => { aborted = true; ac.abort(); });
    const rawSignal = c.req.raw.signal;
    if (rawSignal) {
      if (rawSignal.aborted) { aborted = true; ac.abort(); }
      else rawSignal.addEventListener('abort', () => { aborted = true; ac.abort(); });
    }

    try {
      // 加载历史消息（按 token 预算裁剪）
      const history = await getHistoryMessages(id);
      const messages = [...history, { role: 'user' as const, content: message }];

      for await (const chunk of streamAiChat(messages, configSource, configId, { signal: ac.signal, systemPromptOverride: conversation.systemPromptOverride })) {
        if (chunk.type === 'delta') {
          assistantContent += chunk.content;
          if ('snapshot' in chunk && chunk.snapshot) {
            snapshot = chunk.snapshot;
          }
          await stream.writeSSE({
            event: 'delta',
            data: JSON.stringify({ content: chunk.content }),
          });
        } else if (chunk.type === 'done') {
          tokensInput = chunk.tokensInput;
          tokensOutput = chunk.tokensOutput;
          if ('snapshot' in chunk && chunk.snapshot) {
            snapshot = chunk.snapshot;
          }
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ tokensInput, tokensOutput }),
          });
        } else if (chunk.type === 'error') {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ message: chunk.error }),
          });
          return;
        }
      }
    } catch (err: unknown) {
      // 主动中断：静默结束，下方仍会保存已生成的部分内容
      if (!aborted && !ac.signal.aborted) {
        const msg = err instanceof Error ? err.message : '对话失败';
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: msg }) }).catch(() => {});
        return;
      }
    }

    // 保存消息 & 更新标题（即使被中断，也保存已生成的部分回复）
    if (assistantContent) {
      const { assistantMsgId } = await saveMessages(id, message, assistantContent, tokensInput, tokensOutput, snapshot);

      // 发送包含数据库消息 ID 的 saved 事件，前端用它更新 message.id 以便点赞/点踩调 API
      if (assistantMsgId) {
        await stream.writeSSE({
          event: 'saved',
          data: JSON.stringify({ assistantMsgId }),
        }).catch(() => {});
      }

      // 如果对话还没有自定义标题，用第一条消息的前 30 个字作为标题
      const conversation = await ensureConversationOwner(id).catch(() => null);
      if (conversation?.title === '新对话') {
        await updateConversationTitle(id, message.slice(0, 30));
      }
    }
  });
});

export default router;
