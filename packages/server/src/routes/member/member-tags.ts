import { OpenAPIHono } from '@hono/zod-openapi';
import { memberTagContract } from '@zenith/shared/member';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMemberTags,
  createMemberTag,
  updateMemberTag,
  deleteMemberTag,
  ensureMemberTagExists,
  mapMemberTag,
} from '../../services/member/member-tags.service';
import { mountCrud } from '../_crud';

const memberTagsRouter = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineContractRoute(memberTagContract.list, {
  middleware: [authMiddleware, guard({ permission: 'member:member:list' })],
  handler: async (c) => c.json(okBody(await listMemberTags()), 200),
});

mountCrud(memberTagsRouter, memberTagContract,
  {
    get: async (id: number) => mapMemberTag(await ensureMemberTagExists(id)),
    create: createMemberTag,
    update: updateMemberTag,
    remove: deleteMemberTag,
  },
  { permission: { write: 'member:member:update' }, label: '会员标签', module: '会员标签', exclude: ['list'] },
  [listRoute],
);

export default memberTagsRouter;
