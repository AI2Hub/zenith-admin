import { OpenAPIHono } from '@hono/zod-openapi';
import { mpMessageContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { listMessages, listConversations, sendCustomMessage } from '../../services/mp/mp-message.service';
import { mountCrud } from '../_crud';

const mpMessagesRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'mp:message:list' })] as const;

const conversationsRoute = defineContractRoute(mpMessageContract.conversations, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listConversations(c.req.valid('query').accountId)), 200),
});
const sendRoute = defineContractRoute(mpMessageContract.send, {
  middleware: [authMiddleware, guard({ permission: 'mp:message:send', audit: { description: '发送客服消息', module: '公众号消息' } })],
  handler: async (c) => c.json(okBody(await sendCustomMessage(c.req.valid('json')), '发送成功'), 200),
});

mountCrud(mpMessagesRouter, mpMessageContract,
  { list: listMessages },
  { permission: 'mp:message' },
  [conversationsRoute, sendRoute],
);

export default mpMessagesRouter;
