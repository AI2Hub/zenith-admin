// The dashboard mounts all three charts together. Share one deferred boundary so the
// chart runtime stays lazy without a separate network request for every small chart.
export { default as CmsPublishVisitTrendChart } from './CmsPublishVisitTrendChart';
export { default as CmsChannelDistributionChart } from './CmsChannelDistributionChart';
export { default as CmsContentTypeDonut } from './CmsContentTypeDonut';
export { default as CmsStatsTrend } from './stats/CmsStatsTrend';
