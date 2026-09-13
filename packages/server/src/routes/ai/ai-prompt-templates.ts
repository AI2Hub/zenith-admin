import { OpenAPIHono } from '@hono/zod-openapi';
import { aiPromptTemplateContract } from '@zenith/shared/ai';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listPromptTemplates,
  listChatPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  incrementPromptUsage,
  listPromptTemplateVersions,
  restorePromptTemplateVersion,
} from '../../services/ai/ai-prompt-templates.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'ai:prompt:list' })] as const;
const available = defineContractRoute(aiPromptTemplateContract.all, {
  middleware: [authMiddleware],
  handler: async (c) => c.json(okBody(await listChatPromptTemplates()), 200),
});

const use = defineContractRoute(aiPromptTemplateContract.use, {
  middleware: [authMiddleware],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await incrementPromptUsage(id);
    return c.json(okBody(null, '已记录'), 200);
  },
});
const versions = defineContractRoute(aiPromptTemplateContract.versions, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await listPromptTemplateVersions(id)), 200);
  },
});

const restoreVersion = defineContractRoute(aiPromptTemplateContract.restoreVersion, {
  middleware: [authMiddleware, guard({ permission: 'ai:prompt:edit', audit: { description: '恢复提示词模板版本', module: '智能助手' } })],
  handler: async (c) => {
    const { id, versionId } = c.req.valid('param');
    return c.json(okBody(await restorePromptTemplateVersion(id, versionId), '已恢复到历史版本'), 200);
  },
});

mountCrud(router, aiPromptTemplateContract,
  {
    list: listPromptTemplates,
    get: getPromptTemplate,
    create: createPromptTemplate,
    update: updatePromptTemplate,
    remove: deletePromptTemplate,
  },
  {
    permission: { read: 'ai:prompt:list', create: 'ai:prompt:create', update: 'ai:prompt:edit', remove: 'ai:prompt:delete' },
    audit: null,
  },
  [available, use, versions, restoreVersion],
);

export default router;
