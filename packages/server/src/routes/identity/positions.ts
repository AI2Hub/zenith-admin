import { OpenAPIHono } from '@hono/zod-openapi';
import { positionContract } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { defineScopeMembersRoute } from './_scope-members';
import {
  listAllPositions,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
  batchDeletePositions,
  getPositionsBeforeAudit,
  getPositionBeforeAudit,
  getPosition,
  listPositionMembers,
  setPositionMembers,
  getPositionMembersBeforeAudit,
} from '../../services/identity/positions.service';
import { mountCrud } from '../_crud';

const positionsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'system:position:list' })] as const;

const allRoute = defineContractRoute(positionContract.all, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listAllPositions()), 200),
});
const updatePositionRoute = defineContractRoute(positionContract.update, {
  middleware: [authMiddleware, guard({ permission: 'system:position:update', audit: { description: '更新岗位', module: '岗位管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getPositionBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    const updated = await updatePosition(id, c.req.valid('json'));
    setAuditAfterData(c, updated);
    return c.json(okBody(updated, '更新成功'), 200);
  },
});

const batchDeleteRoute = defineContractRoute(positionContract.removeBatch, {
  middleware: [authMiddleware, guard({ permission: 'system:position:delete', audit: { description: '批量删除岗位', module: '岗位管理' } })] as const,
  handler: async (c) => {
    const { ids } = c.req.valid('json');
    const before = await getPositionsBeforeAudit(ids);
    if (before.length > 0) setAuditBeforeData(c, before);
    const { count } = await batchDeletePositions(ids);
    return c.json(okBody(null, `已删除 ${count} 个岗位`), 200);
  },
});
const listMembersRoute = defineContractRoute(positionContract.members, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listPositionMembers(c.req.valid('param').id)), 200),
});

const memberPreviewRoute = defineScopeMembersRoute({
  op: positionContract.memberPreview,
  scopeType: 'position',
  permission: 'system:position:list',
});

const setMembersRoute = defineContractRoute(positionContract.setMembers, {
  middleware: [authMiddleware, guard({ permission: 'system:position:update', audit: { description: '设置岗位成员', module: '岗位管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const { userIds } = c.req.valid('json');
    const before = await getPositionMembersBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    await setPositionMembers(id, userIds);
    const after = await getPositionMembersBeforeAudit(id);
    if (after) setAuditAfterData(c, after);
    return c.json(okBody(null, '保存成功'), 200);
  },
});

mountCrud(positionsRouter, positionContract,
  { list: listPositions, get: getPosition, create: createPosition, remove: deletePosition },
  { permission: 'system:position', label: '岗位', exclude: ['update', 'removeBatch'] },
  [
    allRoute,
    updatePositionRoute,
    batchDeleteRoute,
    listMembersRoute,
    memberPreviewRoute,
    setMembersRoute,
  ],
);

export default positionsRouter;
