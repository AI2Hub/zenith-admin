import { definePermissions, type PermissionCodes } from '../core/permissions';

/**
 * marketing 域权限码注册表：code → 按钮标题 / 所属页面（菜单 name）。
 * 种子 button 节点由此生成（@zenith/shared/seed），契约操作 / 路由门禁 / 前端按钮以 `Permission` 类型引用。
 * `uiOnly` = 服务端没有任何接口检查该码（纯前端门控或待清理）。
 */
export const MARKETING_PERMISSIONS = definePermissions({
  'marketing:campaign:list': { label: '查询', menu: 'GrowthMarketingCampaigns' },
  'marketing:campaign:create': { label: '新增活动', menu: 'GrowthMarketingCampaigns' },
  'marketing:campaign:update': { label: '编辑活动', menu: 'GrowthMarketingCampaigns' },
  'marketing:campaign:delete': { label: '删除活动', menu: 'GrowthMarketingCampaigns' },
  'marketing:campaign:publish': { label: '发布/结束', menu: 'GrowthMarketingCampaigns' },
  'marketing:record:list': { label: '参与记录', menu: 'GrowthMarketingCampaigns' },
});

declare module '../core/permissions' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 声明合并：把本域权限码合并进全局 Permission 联合
  interface PermissionRegistry extends PermissionCodes<typeof MARKETING_PERMISSIONS> {}
}
