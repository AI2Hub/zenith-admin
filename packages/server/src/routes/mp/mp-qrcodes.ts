import { OpenAPIHono } from '@hono/zod-openapi';
import { mpQrcodeContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { idempotencyGuard } from '../../middleware/idempotency';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMpQrcodes,
  createMpQrcode,
  deleteMpQrcode,
  getMpQrcodeBeforeAudit,
} from '../../services/mp/mp-qrcode.service';
import { mountCrud } from '../_crud';

const mpQrcodesRouter = new OpenAPIHono({ defaultHook: validationHook });
const createRouteDef = defineContractRoute(mpQrcodeContract.create, {
  middleware: [
    authMiddleware,
    guard({ permission: 'mp:qrcode:create', audit: { description: '创建带参二维码', module: '公众号二维码' } }),
    idempotencyGuard({ ttlSeconds: 10 }),
  ],
  handler: async (c) => c.json(okBody(await createMpQrcode(c.req.valid('json')), '生成成功'), 200),
});

mountCrud(mpQrcodesRouter, mpQrcodeContract,
  { list: listMpQrcodes, get: getMpQrcodeBeforeAudit, remove: deleteMpQrcode },
  { permission: 'mp:qrcode', label: '带参二维码', module: '公众号二维码', exclude: ['create'] },
  [createRouteDef],
);

export default mpQrcodesRouter;
