import { OpenAPIHono } from '@hono/zod-openapi';
import { emailSendLogContract } from '@zenith/shared/messaging';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listEmailSendLogs,
  getEmailSendLog,
  deleteEmailSendLog,
  sendEmail,
} from '../../services/messaging/email-send-logs.service';
import { getClientIp } from '../../lib/request-helpers';
import { mountCrud } from '../_crud';

const emailSendLogsRouter = new OpenAPIHono({ defaultHook: validationHook });

const sendRoute = defineContractRoute(emailSendLogContract.testSend, {
  middleware: [authMiddleware, guard({ permission: 'system:email-config:update', audit: { description: '测试发送邮件', module: '邮件发送记录' } })],
  handler: async (c) => {
    const ip = getClientIp(c);
    const result = await sendEmail(c.req.valid('json'), 'manual', ip);
    return c.json(okBody(result, result.status === 'success' ? '发送成功' : '发送失败'), 200);
  },
});

mountCrud(emailSendLogsRouter, emailSendLogContract,
  { list: listEmailSendLogs, get: getEmailSendLog, remove: deleteEmailSendLog },
  { permission: 'system:email-send-log', label: '邮件发送记录', module: '邮件发送记录' },
  [sendRoute],
);

export default emailSendLogsRouter;
