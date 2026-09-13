import { OpenAPIHono } from '@hono/zod-openapi';
import { aiChatModelContract } from '@zenith/shared/ai';
import { validationHook } from '../../lib/openapi-schemas';
import { listChatModels } from '../../services/ai/ai-providers.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, aiChatModelContract,
  { list: listChatModels },
  { permission: null },
);

export default router;
