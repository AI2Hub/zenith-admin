import { OpenAPIHono } from '@hono/zod-openapi';
import { smsSendLogContract } from '@zenith/shared/messaging';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listSmsSendLogs,
  getSmsSendLog,
  deleteSmsSendLog,
  sendSms,
} from '../../services/messaging/sms-send-logs.service';
import { getClientIp } from '../../lib/request-helpers';
import { mountCrud } from '../_crud';

const smsSendLogsRouter = new OpenAPIHono({ defaultHook: validationHook });

const sendRoute = defineContractRoute(smsSendLogContract.testSend, {
  middleware: [authMiddleware, guard({ permission: 'system:sms-send-log:test', audit: { description: '测试发送短信', module: '短信发送记录' } })],
  handler: async (c) => {
    const ip = getClientIp(c);
    const result = await sendSms(c.req.valid('json'), 'manual', ip);
    return c.json(okBody(result, result.status === 'success' ? '发送成功' : '发送失败'), 200);
  },
});

mountCrud(smsSendLogsRouter, smsSendLogContract,
  { list: listSmsSendLogs, get: getSmsSendLog, remove: deleteSmsSendLog },
  { permission: 'system:sms-send-log', label: '短信发送记录', module: '短信发送记录' },
  [sendRoute],
);

export default smsSendLogsRouter;
