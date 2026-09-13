import { OpenAPIHono } from '@hono/zod-openapi';
import { mpConditionalMenuContract } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMpConditionalMenus,
  createMpConditionalMenu,
  updateMpConditionalMenu,
  deleteMpConditionalMenu,
  publishMpConditionalMenu,
  tryMatchMpMenu,
  getMpConditionalMenuBeforeAudit,
} from '../../services/mp/mp-conditional-menu.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'mp:condmenu:list' })] as const;

const listRoute = defineContractRoute(mpConditionalMenuContract.list, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listMpConditionalMenus(c.req.valid('query').accountId)), 200),
});

const tryMatchRoute = defineContractRoute(mpConditionalMenuContract.tryMatch, {
  middleware: read,
  handler: async (c) => {
    const b = c.req.valid('json');
    return c.json(okBody(await tryMatchMpMenu(b.accountId, b.userId)), 200);
  },
});
const publishRoute = defineContractRoute(mpConditionalMenuContract.publish, {
  middleware: [authMiddleware, guard({ permission: 'mp:condmenu:publish', audit: { description: '发布个性化菜单', module: '公众号个性化菜单' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMpConditionalMenuBeforeAudit(id));
    return c.json(okBody(await publishMpConditionalMenu(id), '发布成功'), 200);
  },
});

mountCrud(router, mpConditionalMenuContract,
  {
    get: getMpConditionalMenuBeforeAudit,
    create: createMpConditionalMenu,
    update: updateMpConditionalMenu,
    remove: deleteMpConditionalMenu,
  },
  {
    permission: 'mp:condmenu',
    label: '个性化菜单',
    module: '公众号个性化菜单',
    audit: { create: '新增个性化菜单', update: '编辑个性化菜单' },
    exclude: ['list'],
  },
  [listRoute, tryMatchRoute, publishRoute],
);

export default router;
