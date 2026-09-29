import { describe, expect, it } from 'vitest';
import { cmsConfigurationMatches, cmsConfigurationProjection } from './configuration-state';

describe('configuration publication equality', () => {
  it('compares public site values and inheritance while excluding audits, runtime counters and private settings', () => {
    const online = { id: 1, name: '门户', theme: 'default', settings: { themeConfig: { color: 'blue', unset: null }, cdnPurgeToken: 'old-private' }, inheritance: { seo_title: true }, public_revision: 1 };
    const current = { id: 1, name: '门户', theme: 'default', settings: { themeConfig: { color: 'blue' }, cdnPurgeToken: 'new-private', captchaEnabled: true }, inheritance: { seoTitle: true }, publicRevision: 20, themeRevision: 3, updatedAt: 'later' };
    expect(cmsConfigurationMatches('site', current, online)).toBe(true);
    expect(cmsConfigurationMatches('site', { ...current, settings: { themeConfig: { color: 'red' } } }, online)).toBe(false);
    expect(cmsConfigurationMatches('site', { ...current, inheritance: { seoTitle: false } }, online)).toBe(false);
    expect(JSON.stringify(cmsConfigurationProjection('site', current))).not.toContain('private');
  });
  it('does not mistake a frozen copy of unapproved widget draft data for what the public widget renders', () => {
    const frozen = { id: 3, site_id: 1, name: '草稿名称', draft_data: { items: [{ title: '新内容' }] }, published_name: '线上名称', published_data: { items: [{ title: '旧内容' }] }, status: 'published' };
    expect(cmsConfigurationMatches('widget', frozen, frozen)).toBe(false);
    expect(cmsConfigurationMatches('widget', { ...frozen, name: '线上名称', draft_data: frozen.published_data, draft_revision: 10 }, frozen)).toBe(true);
  });
  it('keeps page resource identities stable and does not let a missing online object count as published', () => {
    const page = { id: 4, siteId: 1, name: '专题', blocks: [{ id: 'hero', type: 'hero', props: { image: 'cms-res://42' } }], updatedAt: 'today', remark: '内部说明' };
    expect(cmsConfigurationMatches('page', page, { ...page, site_id: 1, updatedAt: 'yesterday', remark: '另一个内部说明' })).toBe(true);
    expect(cmsConfigurationMatches('page', page, null)).toBe(false);
    expect(cmsConfigurationMatches('page', { ...page, blocks: [{ id: 'hero', type: 'hero', props: { image: 'cms-res://43' } }] }, page)).toBe(false);
  });
});
