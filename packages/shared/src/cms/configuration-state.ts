import { stableStringify } from '../core/json';
import type { CMS_CONFIGURATION_OBJECT_KINDS } from './constants';

/** One whitelist for publication capture, rendering and configuration-state comparisons. */
export const CMS_PUBLIC_SITE_SETTINGS = ['protocol', 'themePrimary', 'themeDark', 'themeConfig', 'defaultTemplates', 'language', 'langLinks', 'twitterSite', 'twitterCard', 'socialImageAlt', 'analyticsSiteKey', 'telemetry'] as const;
export type CmsConfigurationObjectKind = typeof CMS_CONFIGURATION_OBJECT_KINDS[number];
const SITE_FIELDS = ['id', 'parent_id', 'name', 'code', 'domain', 'alias_domains', 'is_default', 'title', 'keywords', 'description', 'logo', 'favicon', 'icp', 'copyright', 'theme', 'model_id', 'extend', 'static_mode', 'robots', 'status', 'sort'] as const;
const PAGE_FIELDS = ['id', 'site_id', 'name', 'slug', 'path', 'is_home', 'blocks', 'requires_dynamic', 'seo_title', 'seo_keywords', 'seo_description', 'status'] as const;
const WIDGET_FIELDS = ['id', 'site_id', 'code', 'type', 'schema_version', 'status', 'default_renderer_key'] as const;
const PUBLIC_INHERITANCE = ['seo_title', 'seo_keywords', 'seo_description', 'static_mode', 'theme', 'theme_config', 'templates'] as const;
function value(row: Record<string, unknown>, key: string) {
  return row[key] ?? row[key.replace(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase())] ?? null;
}
function stripNullObjectKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(stripNullObjectKeys);
  if (!input || typeof input !== 'object') return input;
  return Object.fromEntries(Object.entries(input).filter(([, entry]) => entry !== null && entry !== undefined).map(([key, entry]) => [key, stripNullObjectKeys(entry)]));
}
/** Raw resource identities stay untouched; signed URLs and audit/revision counters never participate. */
export function cmsConfigurationProjection(kind: CmsConfigurationObjectKind, row: Record<string, unknown> | null, source: 'working' | 'public' = 'working'): Record<string, unknown> | null {
  if (!row) return null;
  const fields = kind === 'site' ? SITE_FIELDS : kind === 'page' ? PAGE_FIELDS : WIDGET_FIELDS;
  const output: Record<string, unknown> = Object.fromEntries(fields.map(key => [key, value(row, key)]));
  if (kind === 'site') {
    const settings = (value(row, 'settings') ?? {}) as Record<string, unknown>;
    output.settings = stripNullObjectKeys(Object.fromEntries(CMS_PUBLIC_SITE_SETTINGS.map(key => [key, settings[key]])));
    const inheritance = (row.inheritance ?? {}) as Record<string, unknown>;
    output.inheritance = Object.fromEntries(PUBLIC_INHERITANCE.map(key => [key, value(inheritance, key) === true]));
  }
  if (kind === 'widget') {
    output.name = value(row, source === 'working' ? 'name' : 'published_name');
    output.data = value(row, source === 'working' ? 'draft_data' : 'published_data');
  }
  return output;
}
export function cmsConfigurationMatches(kind: CmsConfigurationObjectKind, working: Record<string, unknown>, published: Record<string, unknown> | null): boolean {
  return published !== null && stableStringify(cmsConfigurationProjection(kind, working, 'working')) === stableStringify(cmsConfigurationProjection(kind, published, 'public'));
}
