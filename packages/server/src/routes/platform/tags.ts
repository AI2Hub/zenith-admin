import { OpenAPIHono } from '@hono/zod-openapi';
import { tagContract } from '@zenith/shared/platform';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { listTagGroups, tagService } from '../../services/platform/tags.service';
import { mountCrud, readGuard } from '../_crud';

const tagsRouter = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(tagsRouter, tagContract, tagService, { permission: 'system:tag', label: '标签', module: '标签管理' }, [
  defineContractRoute(tagContract.groups, {
    middleware: readGuard('system:tag:list'),
    handler: async (c) => c.json(okBody(await listTagGroups()), 200),
  }),
]);

export default tagsRouter;