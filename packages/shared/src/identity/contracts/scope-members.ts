import * as z from 'zod';
import { idParam, paginated, paginationQuery } from '../../core/api-schemas';
import { op } from '../../core/contract';
import type { Permission } from '../../core/permissions';
import { userPreviewSchema } from './user-preview';

/**
 * 「成员预览」：部门 / 角色 / 岗位 / 用户组列表页「成员」列的查看弹窗共用。
 * 四个来源返回同一形状，前端只需一套渲染；各资源契约通过 `memberPreviewOp()` 声明自己的挂载点，
 * 访问要求取各资源自身的 `:list` 权限码。
 */
export const scopeMemberSchema = userPreviewSchema
  .extend({
    username: z.string(),
    avatar: z.string().nullable(),
  })
  .meta({ id: 'ScopeMember' });

export type ScopeMember = z.infer<typeof scopeMemberSchema>;

export const scopeMemberQuery = paginationQuery.extend({
  keyword: z.string().max(64).optional().meta({ description: '按昵称 / 用户名模糊匹配' }),
});

/** 成员分页预览操作：`GET {basePath}/{id}/member-preview`，`permission` 为所属资源的 `:list` 权限码 */
export function memberPreviewOp(summary: string, permission: Permission) {
  return op.get('/{id}/member-preview', {
    params: idParam,
    query: scopeMemberQuery,
    response: paginated(scopeMemberSchema),
    summary,
    access: { permission },
  });
}
