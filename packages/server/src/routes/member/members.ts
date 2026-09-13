import { OpenAPIHono } from '@hono/zod-openapi';
import { memberContract } from '@zenith/shared/member';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { idempotencyGuard } from '../../middleware/idempotency';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMembers,
  getMemberDetail,
  getMemberOverview,
  getMemberOptions,
  listMemberLoginLogs,
  createMember,
  updateMember,
  setMemberStatus,
  batchSetMemberStatus,
  batchSetMemberLevel,
  resetMemberPasswordByAdmin,
  deleteMember,
  getMemberBeforeAudit,
  getMembersBeforeAudit,
} from '../../services/member/admin-members.service';
import { addGrowthValue } from '../../services/member/member-levels.service';
import { setMemberTags, batchAddMemberTags } from '../../services/member/member-tags.service';
import { doMakeupCheckin, getMakeupCheckinBeforeAudit } from '../../services/member/member-checkin.service';
import { mountCrud } from '../_crud';

const membersRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'member:member:list' })] as const;

const batchStatusRoute = defineContractRoute(memberContract.batchStatus, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '批量更改会员状态', module: '会员管理' } })],
  handler: async (c) => {
    const { ids, status } = c.req.valid('json');
    const before = await getMembersBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const count = await batchSetMemberStatus(ids, status);
    const after = await getMembersBeforeAudit(ids);
    if (after.length > 0) setAuditAfterData(c, after);
    return c.json(okBody(null, `已更新 ${count} 名会员状态`), 200);
  },
});

const batchLevelRoute = defineContractRoute(memberContract.batchLevel, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '批量调整会员等级', module: '会员管理' } })],
  handler: async (c) => {
    const { ids, levelId } = c.req.valid('json');
    const before = await getMembersBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const count = await batchSetMemberLevel(ids, levelId);
    const after = await getMembersBeforeAudit(ids);
    if (after.length > 0) setAuditAfterData(c, after);
    return c.json(okBody(null, `已调整 ${count} 名会员等级`), 200);
  },
});

const batchTagsRoute = defineContractRoute(memberContract.batchTags, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '批量打标签', module: '会员管理' } })],
  handler: async (c) => {
    const { ids, tagIds } = c.req.valid('json');
    const before = await getMembersBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const count = await batchAddMemberTags(ids, tagIds);
    const after = await getMembersBeforeAudit(ids);
    if (after.length > 0) setAuditAfterData(c, after);
    return c.json(okBody(null, `已为 ${count} 名会员追加标签`), 200);
  },
});

const overviewRoute = defineContractRoute(memberContract.overview, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getMemberOverview(c.req.valid('param').id)), 200),
});
const optionsRoute = defineContractRoute(memberContract.options, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getMemberOptions(c.req.valid('query').keyword)), 200),
});

const loginLogsRoute = defineContractRoute(memberContract.loginLogs, {
  middleware: [authMiddleware, guard({ permission: 'member:loginlog:list' })],
  handler: async (c) => c.json(okBody(await listMemberLoginLogs(c.req.valid('query'))), 200),
});

const makeupCheckinRoute = defineContractRoute(memberContract.makeupCheckin, {
  middleware: [authMiddleware, guard({ permission: 'member:checkin:makeup', audit: { description: '会员补签', module: '会员签到' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { date, reason } = c.req.valid('json');
    setAuditBeforeData(c, await getMakeupCheckinBeforeAudit(id, date));
    const result = await doMakeupCheckin({ memberId: id, date, mode: 'admin', reason });
    setAuditAfterData(c, { ...(await getMakeupCheckinBeforeAudit(id, date)), makeupReason: reason });
    return c.json(okBody(result, '补签成功'), 200);
  },
});

const adjustGrowthRoute = defineContractRoute(memberContract.adjustGrowth, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '调整会员成长值', module: '会员管理' } }), idempotencyGuard({ ttlSeconds: 10 })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { delta, remark } = c.req.valid('json');
    setAuditBeforeData(c, await getMemberBeforeAudit(id));
    await addGrowthValue(id, delta);
    const after = await getMemberDetail(id);
    setAuditAfterData(c, { ...after, adjustRemark: remark ?? null });
    return c.json(okBody(after, '已调整'), 200);
  },
});

const setTagsRoute = defineContractRoute(memberContract.setTags, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '设置会员标签', module: '会员管理' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMemberBeforeAudit(id));
    await setMemberTags(id, c.req.valid('json').tagIds);
    const after = await getMemberDetail(id);
    setAuditAfterData(c, after);
    return c.json(okBody(after, '已更新'), 200);
  },
});
const setStatusRoute = defineContractRoute(memberContract.setStatus, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '设置会员状态', module: '会员管理' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { status } = c.req.valid('json');
    setAuditBeforeData(c, await getMemberBeforeAudit(id));
    return c.json(okBody(await setMemberStatus(id, status), '已更新'), 200);
  },
});

const resetPasswordRoute = defineContractRoute(memberContract.resetPassword, {
  middleware: [authMiddleware, guard({ permission: 'member:member:update', audit: { description: '重置会员密码', module: '会员管理' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getMemberBeforeAudit(id));
    await resetMemberPasswordByAdmin(id, c.req.valid('json').newPassword);
    return c.json(okBody(null, '密码已重置'), 200);
  },
});

mountCrud(membersRouter, memberContract,
  { list: listMembers, get: getMemberDetail, create: createMember, update: updateMember, remove: deleteMember },
  { permission: 'member:member', label: '会员' },
  [
    batchStatusRoute,
    batchLevelRoute,
    batchTagsRoute,
    overviewRoute,
    optionsRoute,
    loginLogsRoute,
    makeupCheckinRoute,
    adjustGrowthRoute,
    setTagsRoute,
    setStatusRoute,
    resetPasswordRoute,
  ],
);

export default membersRouter;
