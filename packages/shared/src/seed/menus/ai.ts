import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 智能助手（3000 段） */
export const SEED_MENUS_AI: Menu[] = [
  { id: 3000, parentId: 0, title: '智能助手', name: 'AiFeatures', icon: 'Sparkles', type: 'directory', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3010, parentId: 3000, title: '智能对话', name: 'AiChat', path: '/ai/chat', component: 'ai/chat/AIChatPage', icon: 'MessageSquare', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3020, parentId: 3000, title: 'AI 服务商', name: 'AiProviders', path: '/ai/providers', component: 'ai/providers/AIProvidersPage', icon: 'Cpu', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3030, parentId: 3000, title: 'AI 反馈', name: 'AiFeedback', path: '/ai/feedback', component: 'ai/feedback/AiFeedbackPage', icon: 'ThumbsUp', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3040, parentId: 3000, title: '提示词模板', name: 'AiPromptTemplates', path: '/ai/prompts', component: 'ai/prompts/PromptTemplatesPage', icon: 'BookText', type: 'menu', sort: 4, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3050, parentId: 3000, title: '用量统计', name: 'AiUsage', path: '/ai/usage', component: 'ai/usage/AiUsagePage', icon: 'BarChart3', type: 'menu', sort: 5, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3060, parentId: 3000, title: '对话审计', name: 'AiAudit', path: '/ai/audit', component: 'ai/audit/AiAuditPage', icon: 'ShieldCheck', type: 'menu', sort: 6, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3070, parentId: 3000, title: '知识库', name: 'AiKnowledge', path: '/ai/knowledge', component: 'ai/knowledge/AiKnowledgePage', icon: 'Library', type: 'menu', sort: 7, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3080, parentId: 3000, title: '智能体', name: 'AiAgents', path: '/ai/agents', component: 'ai/agents/AiAgentsPage', icon: 'Bot', type: 'menu', sort: 8, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3090, parentId: 3000, title: 'AI 工具', name: 'AiTools', path: '/ai/tools', component: 'ai/tools/AiToolsPage', icon: 'Wrench', type: 'menu', sort: 9, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
  { id: 3100, parentId: 3000, title: '模型评测', name: 'AiEval', path: '/ai/eval', component: 'ai/eval/AiEvalPage', icon: 'FlaskConical', type: 'menu', sort: 10, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 工作流引擎（4000 段）
];
