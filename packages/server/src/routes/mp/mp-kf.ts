import { OpenAPIHono } from '@hono/zod-openapi';
import { mpKfAccountContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  mpKfAccountService,
  syncMpKfAccounts,
} from '../../services/mp/mp-kf.service';
import { mountCrud } from '../_crud';

const mpKfRouter = new OpenAPIHono({ defaultHook: validationHook });
const syncRoute = defineContractRoute(mpKfAccountContract.sync, {
  middleware: [authMiddleware, guard({ permission: 'mp:kf:sync', audit: { description: '同步客服账号', module: '公众号多客服' } })],
  handler: async (c) => c.json(okBody(await syncMpKfAccounts(c.req.valid('json').accountId), '同步完成'), 200),
});

mountCrud(mpKfRouter, mpKfAccountContract,
  mpKfAccountService,
  { permission: 'mp:kf', label: '客服账号', module: '公众号多客服', audit: { create: '添加客服账号', update: '修改客服账号' } },
  [syncRoute],
);

export default mpKfRouter;
