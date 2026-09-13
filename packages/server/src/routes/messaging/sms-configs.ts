import { OpenAPIHono } from '@hono/zod-openapi';
import { smsConfigContract } from '@zenith/shared/messaging';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listSmsConfigs,
  getSmsConfig,
  createSmsConfig,
  updateSmsConfig,
  deleteSmsConfig,
  getSmsConfigBeforeAudit,
  setSmsConfigDefault,
} from '../../services/messaging/sms-configs.service';
import { mountCrud } from '../_crud';

const smsConfigsRouter = new OpenAPIHono({ defaultHook: validationHook });

const setDefaultRoute = defineContractRoute(smsConfigContract.setDefault, {
  middleware: [authMiddleware, guard({ permission: 'system:sms-config:default', audit: { description: '设为默认短信配置', module: '短信配置' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getSmsConfigBeforeAudit(id));
    return c.json(okBody(await setSmsConfigDefault(id), '操作成功'), 200);
  },
});

mountCrud(smsConfigsRouter, smsConfigContract,
  {
    list: listSmsConfigs,
    get: getSmsConfig,
    create: createSmsConfig,
    update: updateSmsConfig,
    remove: deleteSmsConfig,
  },
  { permission: 'system:sms-config', label: '短信配置', module: '短信配置' },
  [setDefaultRoute],
);

export default smsConfigsRouter;
