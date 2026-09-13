import { OpenAPIHono } from '@hono/zod-openapi';
import { aiProviderContract } from '@zenith/shared/ai';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listAiProviderConfigs,
  getAiProviderConfig,
  createAiProviderConfig,
  updateAiProviderConfig,
  deleteAiProviderConfig,
  setDefaultAiProviderConfig,
  testAiProviderConnection,
  fetchProviderModels,
  getProviderCatalog,
  getCatalogProviderModels,
} from '../../services/ai/ai-providers.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'ai:provider:list' })] as const;
const edit = [authMiddleware, guard({ permission: 'ai:provider:edit' })] as const;

const catalog = defineContractRoute(aiProviderContract.catalog, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getProviderCatalog()), 200),
});

const catalogModels = defineContractRoute(aiProviderContract.catalogModels, {
  middleware: read,
  handler: async (c) => {
    const { providerId } = c.req.valid('param');
    return c.json(okBody(await getCatalogProviderModels(providerId)), 200);
  },
});
const setDefault = defineContractRoute(aiProviderContract.setDefault, {
  middleware: edit,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await setDefaultAiProviderConfig(id), '已设为默认'), 200);
  },
});

const testConnection = defineContractRoute(aiProviderContract.testConnection, {
  middleware: edit,
  handler: async (c) => {
    const result = await testAiProviderConnection(c.req.valid('json'));
    return c.json(okBody(result), 200);
  },
});

const fetchModels = defineContractRoute(aiProviderContract.fetchModels, {
  middleware: edit,
  handler: async (c) => c.json(okBody(await fetchProviderModels(c.req.valid('json'))), 200),
});

mountCrud(router, aiProviderContract,
  {
    get: getAiProviderConfig,
    create: createAiProviderConfig,
    update: updateAiProviderConfig,
    remove: deleteAiProviderConfig,
    list: listAiProviderConfigs,
  },
  {
    permission: { read: 'ai:provider:list', create: 'ai:provider:create', update: 'ai:provider:edit', remove: 'ai:provider:delete' },
    audit: null,
  },
  [catalog, catalogModels, setDefault, testConnection, fetchModels],
);

export default router;
