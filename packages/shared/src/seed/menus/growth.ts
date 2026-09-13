import type { Menu } from '../../identity/contracts';
import { SEED_DATE } from '../_base';

/** 运营中心（17000 段）—— 短链服务等增长运营工具的归属目录 */
export const SEED_MENUS_GROWTH: Menu[] = [
  { id: 17000, parentId: 0, title: '运营中心', name: 'GrowthCenter', icon: 'Megaphone', type: 'directory', sort: 17, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 短链管理 ──────────────────────────────────────────────────────────────
  { id: 17010, parentId: 17000, title: '短链管理', name: 'GrowthShortLinks', path: '/growth/short-links', component: 'short-link/ShortLinksPage', icon: 'Link2', type: 'menu', sort: 1, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 营销活动 ──────────────────────────────────────────────────────────────
  { id: 17020, parentId: 17000, title: '营销活动', name: 'GrowthMarketingCampaigns', path: '/growth/marketing-campaigns', component: 'marketing/MarketingCampaignsPage', icon: 'Gift', type: 'menu', sort: 2, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },

  // ─── 渠道推广分析 ──────────────────────────────────────────────────────────
  { id: 17030, parentId: 17000, title: '渠道分析', name: 'GrowthChannelAnalysis', path: '/growth/channel-analysis', component: 'short-link/ChannelAnalysisPage', icon: 'TrendingUp', type: 'menu', sort: 3, status: 'enabled', visible: true, createdAt: SEED_DATE, updatedAt: SEED_DATE },
];
