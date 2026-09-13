import { OpenAPIHono } from '@hono/zod-openapi';
import { developerAppContract } from '@zenith/shared/open-platform';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  createMyOAuth2Client,
  deleteMyOAuth2Client,
  getMyOAuth2Client,
  getMyOAuth2ClientQuotaUsage,
  listMyOAuth2Clients,
  regenerateMyOAuth2ClientSecret,
  submitMyOAuth2ClientForReview,
  updateMyOAuth2Client,
} from '../../services/open-platform/developer-apps.service';
import { executeOpenApiDebugRequest } from '../../services/open-platform/open-api-debug.service';
import { OPEN_GATEWAY_ENDPOINTS } from './open-gateway';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });
const audit = (description: string) => guard({
  audit: { description, module: '开放平台-开发者中心', recordResponseBody: false },
});
const create = defineContractRoute(developerAppContract.create, {
  middleware: [authMiddleware, audit('创建开发者应用')],
  handler: async (c) => {
    const result = await createMyOAuth2Client(c.req.valid('json'));
    setAuditAfterData(c, { ...result, clientSecret: result.clientSecret ? '[REDACTED]' : '' });
    return c.json(okBody(result, '应用已保存为草稿，请保存密钥后提交审核'), 200);
  },
});
const update = defineContractRoute(developerAppContract.update, {
  middleware: [authMiddleware, audit('更新开发者应用')],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMyOAuth2Client(id));
    const result = await updateMyOAuth2Client(id, c.req.valid('json'));
    setAuditAfterData(c, result);
    return c.json(okBody(result, '更新成功，应用已回到草稿状态'), 200);
  },
});

const remove = defineContractRoute(developerAppContract.remove, {
  middleware: [authMiddleware, audit('删除开发者应用')],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMyOAuth2Client(id));
    await deleteMyOAuth2Client(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const regenerate = defineContractRoute(developerAppContract.regenerateSecret, {
  middleware: [authMiddleware, audit('轮换开发者应用密钥')],
  handler: async (c) => {
    const result = await regenerateMyOAuth2ClientSecret(c.req.valid('param').id);
    setAuditAfterData(c, {
      clientId: result.clientId,
      clientSecret: '[REDACTED]',
      previousValidUntil: result.previousValidUntil,
    });
    return c.json(okBody(result, '密钥轮换成功'), 200);
  },
});

const submit = defineContractRoute(developerAppContract.submit, {
  middleware: [authMiddleware, audit('提交开发者应用审核')],
  handler: async (c) => c.json(okBody(await submitMyOAuth2ClientForReview(c.req.valid('param').id), '已提交审核'), 200),
});

const quotaUsage = defineContractRoute(developerAppContract.quotaUsage, {
  middleware: [authMiddleware],
  handler: async (c) => c.json(okBody(await getMyOAuth2ClientQuotaUsage(c.req.valid('param').id)), 200),
});

const endpointCatalog = defineContractRoute(developerAppContract.debugEndpoints, {
  middleware: [authMiddleware],
  handler: (c) => c.json(okBody(OPEN_GATEWAY_ENDPOINTS), 200),
});

const debugRequest = defineContractRoute(developerAppContract.debug, {
  middleware: [authMiddleware, audit('在线调试开放 API')],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await executeOpenApiDebugRequest(id, c.req.valid('json'))), 200);
  },
});

mountCrud(router, developerAppContract,
  { list: listMyOAuth2Clients, get: getMyOAuth2Client },
  { permission: null, exclude: ['create', 'update', 'remove'] },
  [create, submit, regenerate, quotaUsage, endpointCatalog, debugRequest, update, remove],
);

export default router;
