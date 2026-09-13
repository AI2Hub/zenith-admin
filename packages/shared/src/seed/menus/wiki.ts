import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 知识中心（16000 段） */
export const SEED_MENUS_WIKI: Menu[] = [
  { id: 16000, parentId: 0, title: '知识中心', name: 'WikiCenter', icon: 'BookOpen', type: 'directory', sort: 16, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 文档中心（主工作台）───────────────────────────────────────────────────
  { id: 16010, parentId: 16000, title: '文档中心', name: 'WikiDocCenter', path: '/wiki/docs', component: 'wiki/docs/WikiDocCenterPage', icon: 'BookOpenText', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // 全屏编辑页与版本对比页：从文档中心跳转进入，不在侧边栏展示
  { id: 16017, parentId: 16010, title: '文档编辑页', name: 'WikiDocEdit', path: '/wiki/docs/edit', component: 'wiki/docs/WikiDocEditPage', icon: 'FilePen', type: 'menu', sort: 8, status: 'enabled', visible: false, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 16018, parentId: 16010, title: '版本对比页', name: 'WikiDocHistory', path: '/wiki/docs/history', component: 'wiki/docs/WikiDocHistoryPage', icon: 'History', type: 'menu', sort: 9, status: 'enabled', visible: false, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 知识空间 ──────────────────────────────────────────────────────────────
  { id: 16020, parentId: 16000, title: '知识空间', name: 'WikiSpaces', path: '/wiki/spaces', component: 'wiki/spaces/WikiSpacesPage', icon: 'LibraryBig', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 发布审核 ──────────────────────────────────────────────────────────────
  { id: 16030, parentId: 16000, title: '发布审核', name: 'WikiApprovals', path: '/wiki/approvals', component: 'wiki/approvals/WikiApprovalsPage', icon: 'FileCheck2', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 文档模板 ──────────────────────────────────────────────────────────────
  { id: 16040, parentId: 16000, title: '文档模板', name: 'WikiTemplates', path: '/wiki/templates', component: 'wiki/templates/WikiTemplatesPage', icon: 'LayoutTemplate', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 标签管理 ──────────────────────────────────────────────────────────────
  { id: 16050, parentId: 16000, title: '标签管理', name: 'WikiTags', path: '/wiki/tags', component: 'wiki/tags/WikiTagsPage', icon: 'Tags', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 评论管理 ──────────────────────────────────────────────────────────────
  { id: 16060, parentId: 16000, title: '评论管理', name: 'WikiComments', path: '/wiki/comments', component: 'wiki/comments/WikiCommentsPage', icon: 'MessagesSquare', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 回收站 ────────────────────────────────────────────────────────────────
  { id: 16070, parentId: 16000, title: '回收站', name: 'WikiRecycle', path: '/wiki/recycle', component: 'wiki/recycle/WikiRecyclePage', icon: 'Recycle', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 知识统计 ──────────────────────────────────────────────────────────────
  { id: 16080, parentId: 16000, title: '知识统计', name: 'WikiStats', path: '/wiki/stats', component: 'wiki/stats/WikiStatsPage', icon: 'ChartColumnBig', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 知识库设置 ────────────────────────────────────────────────────────────
  { id: 16090, parentId: 16000, title: '知识库设置', name: 'WikiSettings', path: '/wiki/settings', component: 'wiki/settings/WikiSettingsPage', icon: 'Settings', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 内容治理 ──────────────────────────────────────────────────────────────
  { id: 16100, parentId: 16000, title: '内容治理', name: 'WikiGovernance', path: '/wiki/governance', component: 'wiki/governance/WikiGovernancePage', icon: 'ShieldCheck', type: 'menu', sort: 10, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
];
