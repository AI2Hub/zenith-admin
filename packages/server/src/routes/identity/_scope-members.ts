/**
 * 「成员预览」路由工厂：部门 / 角色 / 岗位 / 用户组四处形状完全一致，只有契约挂载点与权限码不同。
 *
 * 之所以做成四条各自守卫的路由、而不是一条带 scopeType 参数的通用路由：
 * `guard({ permission: [...] })` 是「满足其一」语义，通用路由只能声明四个权限的并集，
 * 那样只有角色查看权的人就能读到部门成员。每个域用自己的 `:list` 权限守卫，
 * 才能保证「能看见这个列表页 = 能看这一列的成员」，前端也因此不需要任何额外权限判断。
 */
import type { Bind } from '@zenith/shared/core';
import type { memberPreviewOp } from '@zenith/shared/identity';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody } from '../../lib/openapi-schemas';
import { listScopeMembers, type UserScopeType } from '../../services/identity/user-scope.service';
import type { Permission } from '@zenith/shared/core';

type MemberPreviewOperation = Bind<ReturnType<typeof memberPreviewOp>>;

export function defineScopeMembersRoute(options: {
  op: MemberPreviewOperation;
  scopeType: UserScopeType;
  permission: Permission;
}) {
  return defineContractRoute(options.op, {
    middleware: [authMiddleware, guard({ permission: options.permission })] as const,
    handler: async (c) => c.json(
      okBody(await listScopeMembers(options.scopeType, c.req.valid('param').id, c.req.valid('query'))),
      200,
    ),
  });
}
