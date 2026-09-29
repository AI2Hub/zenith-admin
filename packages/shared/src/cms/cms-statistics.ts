/** Reporting dimensions and arithmetic shared by API, UI and fixtures. */
/** Covers a leap-year comparison plus a full 90-day range and delayed delivery. */
export const CMS_STAT_MIN_RETENTION_DAYS = 550;
export function normalizeCmsSearchKeyword(value: string): string { return value.trim().toLowerCase(); }
export const CMS_STAT_DIMENSIONS = ['content', 'channel', 'author', 'contentType', 'release', 'source', 'entry', 'referrer', 'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent', 'device', 'browser', 'os', 'country', 'search', 'media', 'placement', 'form', 'interaction'] as const;
export const CMS_STAT_GRANULARITIES = ['day', 'hour'] as const;
export const CMS_STAT_COMPARISONS = ['previous_period', 'previous_year', 'none'] as const;
export const CMS_STAT_SORT_FIELDS = ['pv', 'uv', 'sessions', 'reads', 'activeMs', 'conversions', 'searches', 'noResultSearches', 'searchClicks', 'downloads', 'impressions', 'clicks', 'mediaStarts', 'mediaErrors'] as const;
export const CMS_STAT_SORT_ORDERS = ['asc', 'desc'] as const;
export const CMS_STAT_STATUSES = ['disabled', 'pending_publication', 'collecting', 'empty', 'attention'] as const;
export const CMS_STAT_CONVERSION_EVENTS = ['cms.form_complete', 'cms.vote_complete', 'cms.comment_complete', 'cms.follow_complete'] as const;
export function isCmsStatTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}
export function cmsStatRate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : 0;
}
