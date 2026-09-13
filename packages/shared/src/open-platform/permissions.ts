import { definePermissions, type PermissionCodes } from '../core/permissions';

/**
 * open-platform 域权限码注册表：code → 按钮标题 / 所属页面（菜单 name）。
 * 种子 button 节点由此生成（@zenith/shared/seed），契约操作 / 路由门禁 / 前端按钮以 `Permission` 类型引用。
 * `uiOnly` = 服务端没有任何接口检查该码（纯前端门控或待清理）。
 */
export const OPEN_PLATFORM_PERMISSIONS = definePermissions({
  'system:oauth2-apps:view': { label: '查询', menu: 'SystemOAuth2Apps' },
  'system:oauth2-apps:manage': { label: '管理应用', menu: 'SystemOAuth2Apps' },
  'open:scope:view': { label: '查询', menu: 'OpenApiScopes' },
  'open:scope:manage': { label: '管理 Scope', menu: 'OpenApiScopes' },
  'open:rate-plan:view': { label: '查询', menu: 'OpenRatePlans' },
  'open:rate-plan:manage': { label: '管理套餐', menu: 'OpenRatePlans' },
  'open:stats:view': { label: '查询', menu: 'OpenApiStats' },
  'open:signature:use': { label: '查询', menu: 'OpenSignature' },
  'open:webhook:view': { label: '查询', menu: 'OpenWebhooks' },
  'open:webhook:manage': { label: '管理 Webhook', menu: 'OpenWebhooks' },
  'open:sdk:view': { label: '查询', menu: 'OpenSdk', uiOnly: true },
});

declare module '../core/permissions' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 声明合并：把本域权限码合并进全局 Permission 联合
  interface PermissionRegistry extends PermissionCodes<typeof OPEN_PLATFORM_PERMISSIONS> {}
}
