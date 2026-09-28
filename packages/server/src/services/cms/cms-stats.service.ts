export type CmsDeviceType = 'pc' | 'mobile' | 'bot';

/** UA → 设备类型（bot 优先，供报表区分爬虫流量） */
export function detectDeviceType(userAgent: string | null | undefined): CmsDeviceType {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua || /bot|spider|crawl|slurp|fetch|monitor|curl|wget|python-requests/.test(ua)) return 'bot';
  if (/mobile|android|iphone|ipad|ipod|harmonyos|miniprogram/.test(ua)) return 'mobile';
  return 'pc';
}


export { getCmsVisitStatsV2 as getCmsVisitStats, getCmsSearchAnalyticsV2 as getCmsSearchAnalytics } from './cms-stats-query';

