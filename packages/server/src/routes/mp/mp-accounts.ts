import { OpenAPIHono } from '@hono/zod-openapi';
import { mpAccountContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMpAccounts,
  getMpAccount,
  createMpAccount,
  updateMpAccount,
  deleteMpAccount,
  setMpAccountDefault,
  testMpAccountConnection,
  getMpAccountDefaultAudit,
} from '../../services/mp/mp-account.service';
import { mountCrud } from '../_crud';

const mpAccountsRouter = new OpenAPIHono({ defaultHook: validationHook });

const setDefaultRoute = defineContractRoute(mpAccountContract.setDefault, {
  middleware: [authMiddleware, guard({ permission: 'mp:account:default', audit: { description: '设为默认公众号', module: '公众号管理' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpAccountDefaultAudit(id));
    const updated = await setMpAccountDefault(id);
    setAuditAfterData(c, await getMpAccountDefaultAudit(id));
    return c.json(okBody(updated, '操作成功'), 200);
  },
});

const testConnectionRoute = defineContractRoute(mpAccountContract.testConnection, {
  middleware: [authMiddleware, guard({ permission: 'mp:account:token', audit: { description: '测试公众号连接', module: '公众号管理' } })],
  handler: async (c) => c.json(okBody(await testMpAccountConnection(c.req.valid('param').id), '连接成功'), 200),
});

mountCrud(mpAccountsRouter, mpAccountContract,
  {
    list: listMpAccounts,
    get: getMpAccount,
    create: createMpAccount,
    update: updateMpAccount,
    remove: deleteMpAccount,
  },
  { permission: 'mp:account', label: '公众号' },
  [setDefaultRoute, testConnectionRoute],
);

export default mpAccountsRouter;
