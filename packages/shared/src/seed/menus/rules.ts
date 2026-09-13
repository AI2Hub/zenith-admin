import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 规则中心（6000 段） */
export const SEED_MENUS_RULES: Menu[] = [
  { id: 6000, parentId: 0, title: '规则中心', name: 'RuleCenter', icon: 'Table2', type: 'directory', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 6010, parentId: 6000, title: '决策表', name: 'RuleTables', path: '/rules/tables', component: 'rules/tables/RuleTablesPage', icon: 'Grid3x3', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 6020, parentId: 6000, title: '执行记录', name: 'RuleExecutions', path: '/rules/executions', component: 'rules/executions/RuleExecutionsPage', icon: 'History', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 6030, parentId: 6000, title: '决策流', name: 'RuleFlows', path: '/rules/flows', component: 'rules/flows/RuleFlowsPage', icon: 'GitBranch', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 6040, parentId: 6000, title: '名单库', name: 'RuleLists', path: '/rules/lists', component: 'rules/lists/RuleListsPage', icon: 'ShieldBan', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 6050, parentId: 6000, title: '评分卡', name: 'RuleScorecards', path: '/rules/scorecards', component: 'rules/scorecards/RuleScorecardsPage', icon: 'Calculator', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 数据分析（7000 段）
];
