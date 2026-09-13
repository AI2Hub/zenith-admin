import { OpenAPIHono } from '@hono/zod-openapi';
import { wikiSpaceContract } from '@zenith/shared/wiki';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData, setAuditAfterData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  createWikiSpace,
  deleteWikiSpace,
  getWikiSpace,
  getWikiSpaceMembersBeforeAudit,
  listMyWikiSpaces,
  listWikiSpaceMembers,
  listWikiSpaces,
  saveWikiSpaceMembers,
  updateWikiSpace,
} from '../../services/wiki/spaces.service';
import { mountCrud } from '../_crud';

const spacesRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'wiki:space:list' })] as const;
const myRoute = defineContractRoute(wikiSpaceContract.my, {
  middleware: [authMiddleware, guard({ permission: 'wiki:doc:list' })],
  handler: async (c) => c.json(okBody(await listMyWikiSpaces()), 200),
});
const listMembersRoute = defineContractRoute(wikiSpaceContract.listMembers, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await listWikiSpaceMembers(id)), 200);
  },
});

const saveMembersRoute = defineContractRoute(wikiSpaceContract.saveMembers, {
  middleware: [authMiddleware, guard({
    permission: 'wiki:space:grant',
    audit: { description: '分配空间成员', module: '知识中心' },
  })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getWikiSpaceMembersBeforeAudit(id));
    await saveWikiSpaceMembers(id, c.req.valid('json'));
    setAuditAfterData(c, await getWikiSpaceMembersBeforeAudit(id));
    return c.json(okBody(null, '保存成功'), 200);
  },
});

mountCrud(spacesRouter, wikiSpaceContract,
  {
    list: listWikiSpaces,
    get: getWikiSpace,
    create: createWikiSpace,
    update: updateWikiSpace,
    remove: deleteWikiSpace,
  },
  {
    permission: { read: 'wiki:space:list', create: 'wiki:space:create', update: 'wiki:space:edit', remove: 'wiki:space:delete' },
    label: '知识空间',
    module: '知识中心',
  },
  [myRoute, listMembersRoute, saveMembersRoute],
);

export default spacesRouter;
