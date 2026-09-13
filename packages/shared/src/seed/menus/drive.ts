import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 企业网盘（19000 段） */
export const SEED_MENUS_DRIVE: Menu[] = [
  { id: 19000, parentId: 0, title: '企业网盘', name: 'DriveCenter', icon: 'HardDrive', type: 'directory', sort: 19, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 我的网盘（工作台：空间 / 与我共享 / 收藏 / 最近 / 回收站 / 我的外链）──────
  { id: 19010, parentId: 19000, title: '我的网盘', name: 'DriveWorkbench', path: '/drive', component: 'drive/DriveWorkbenchPage', icon: 'FolderOpen', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 共享空间 ──────────────────────────────────────────────────────────────
  { id: 19030, parentId: 19000, title: '共享空间', name: 'DriveSpaces', path: '/drive/spaces', component: 'drive/spaces/DriveSpacesPage', icon: 'Users', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 网盘管理 ──────────────────────────────────────────────────────────────
  { id: 19100, parentId: 19000, title: '网盘管理', name: 'DriveAdmin', icon: 'ShieldCheck', type: 'directory', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  { id: 19110, parentId: 19100, title: '空间治理', name: 'DriveAdminSpaces', path: '/drive/admin/spaces', component: 'drive/admin/DriveAdminSpacesPage', icon: 'Database', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  { id: 19120, parentId: 19100, title: '外链治理', name: 'DriveAdminShareLinks', path: '/drive/admin/share-links', component: 'drive/admin/DriveAdminShareLinksPage', icon: 'Link2', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  { id: 19130, parentId: 19100, title: '动态审计', name: 'DriveAdminActivities', path: '/drive/admin/activities', component: 'drive/admin/DriveAdminActivitiesPage', icon: 'ScrollText', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // 合规治理：法律保留 / 扩容审批 / 外链访问日志 / 开放应用授权（列表查询复用 drive:admin:space:list 与 drive:admin:link:list）
  { id: 19150, parentId: 19100, title: '合规治理', name: 'DriveAdminGovernance', path: '/drive/admin/governance', component: 'drive/admin/DriveAdminGovernancePage', icon: 'Scale', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  { id: 19140, parentId: 19100, title: '网盘设置', name: 'DriveAdminSettings', path: '/drive/admin/settings', component: 'drive/admin/DriveAdminSettingsPage', icon: 'Settings2', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
];
