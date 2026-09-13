import { OpenAPIHono } from '@hono/zod-openapi';
import { chatBotContract } from '@zenith/shared/chat';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listChatWebhooks,
  createChatWebhook,
  updateChatWebhook,
  deleteChatWebhook,
  regenerateChatWebhookToken,
  getChatWebhookBeforeAudit,
  sanitizeChatWebhookForAudit,
} from '../../services/chat/chat-webhooks.service';
import { mountCrud } from '../_crud';

const chatBotsRoute = new OpenAPIHono({ defaultHook: validationHook });

const MODULE = '聊天机器人';
const create = defineContractRoute(chatBotContract.create, {
  middleware: [authMiddleware, guard({
    permission: 'chat:bot:create',
    audit: { description: '创建聊天 Webhook', module: MODULE, recordResponseBody: false },
  })],
  handler: async (c) => {
    const row = await createChatWebhook(c.req.valid('json'));
    setAuditAfterData(c, sanitizeChatWebhookForAudit(row));
    return c.json(okBody(row, '创建成功'), 200);
  },
});

const update = defineContractRoute(chatBotContract.update, {
  middleware: [authMiddleware, guard({
    permission: 'chat:bot:update',
    audit: { description: '更新聊天 Webhook', module: MODULE, recordResponseBody: false },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getChatWebhookBeforeAudit(id));
    const row = await updateChatWebhook(id, c.req.valid('json'));
    setAuditAfterData(c, sanitizeChatWebhookForAudit(row));
    return c.json(okBody(row, '更新成功'), 200);
  },
});

const regenerate = defineContractRoute(chatBotContract.regenerateToken, {
  middleware: [authMiddleware, guard({
    permission: 'chat:bot:update',
    audit: { description: '重置聊天 Webhook 令牌', module: MODULE, recordResponseBody: false },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getChatWebhookBeforeAudit(id));
    const row = await regenerateChatWebhookToken(id);
    setAuditAfterData(c, sanitizeChatWebhookForAudit(row));
    return c.json(okBody(row, '令牌已重置'), 200);
  },
});

mountCrud(chatBotsRoute, chatBotContract,
  { list: listChatWebhooks, get: getChatWebhookBeforeAudit, remove: deleteChatWebhook },
  { permission: 'chat:bot', label: '聊天 Webhook', module: MODULE, exclude: ['create', 'update'] },
  [create, update, regenerate],
);

export default chatBotsRoute;
