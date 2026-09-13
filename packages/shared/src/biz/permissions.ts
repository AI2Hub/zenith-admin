import { definePermissions, type PermissionCodes } from '../core/permissions';

/**
 * biz 域权限码注册表：code → 按钮标题 / 所属页面（菜单 name）。
 * 种子 button 节点由此生成（@zenith/shared/seed），契约操作 / 路由门禁 / 前端按钮以 `Permission` 类型引用。
 * `uiOnly` = 服务端没有任何接口检查该码（纯前端门控或待清理）。
 */
export const BIZ_PERMISSIONS = definePermissions({
  'biz:task-demo:submit': { label: '提交演示任务', menu: 'BizTaskDemo', sort: 1 },
});

declare module '../core/permissions' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 声明合并：把本域权限码合并进全局 Permission 联合
  interface PermissionRegistry extends PermissionCodes<typeof BIZ_PERMISSIONS> {}
}
