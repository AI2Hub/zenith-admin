import { describe, expect, it } from 'vitest';
import { inspectCmsPageBlocks, cmsPageHtmlHasContent } from './page-block-quality';
import { cmsPageImageOptionsSchema, cmsPageImagePresentation } from './page-image';
import { cmsPageBlockSchema } from './validation';

describe('page block quality and image presentation', () => {
  it('returns every actionable issue with its owning block and field', () => {
    const issues = inspectCmsPageBlocks([
      { id: 'hero', type: 'hero', props: { title: '', buttonText: '了解更多', image: '/hero.jpg' } },
      { id: 'photo', type: 'image', props: { src: '/photo.jpg', imageDecorative: true, linkUrl: '/about' } },
      { id: 'copy', type: 'richtext', props: { html: '<p>&nbsp;\u200B<br></p>' } },
      { id: 'cards', type: 'columns', props: { items: [{ title: '', description: '' }] } },
    ]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockId: 'hero', fieldPath: 'title', rule: 'hero-title' }),
      expect.objectContaining({ blockId: 'hero', fieldPath: 'buttonUrl', rule: 'button-pair' }),
      expect.objectContaining({ blockId: 'hero', fieldPath: 'imageAlt', rule: 'image-alt' }),
      expect.objectContaining({ blockId: 'photo', fieldPath: 'linkLabel', rule: 'image-link-label' }),
      expect.objectContaining({ blockId: 'copy', fieldPath: 'html', rule: 'empty-richtext' }),
      expect.objectContaining({ blockId: 'cards', fieldPath: 'items.0', rule: 'empty-column' }),
    ]));
  });
  it('distinguishes intentionally decorative images from informative and linked images', () => {
    expect(inspectCmsPageBlocks([{ id: 'decoration', type: 'image', props: { src: '/hero.jpg', imageDecorative: true } }])).toEqual([]);
    expect(inspectCmsPageBlocks([{ id: 'photo', type: 'image', props: { src: '/photo.jpg', imageDecorative: false, imageAlt: '市民在图书馆阅读', linkUrl: 'entity:channel/2' } }])).toEqual([]);
    expect(inspectCmsPageBlocks([{ id: 'cta', type: 'image', props: { src: '/button.jpg', imageDecorative: true, linkUrl: '/guide', linkLabel: '查看参观指南' } }])).toEqual([]);
  });
  it('accepts meaningful media but rejects empty or script-only rich text', () => {
    expect(cmsPageHtmlHasContent('<p><br></p>')).toBe(false);
    expect(cmsPageHtmlHasContent('<script>alert(1)')).toBe(false);
    expect(cmsPageHtmlHasContent('<img src="cms-res://3" alt="风景">')).toBe(true);
    expect(cmsPageHtmlHasContent('<p>图书馆开放时间</p>')).toBe(true);
  });
  it('rejects CSS injection and out-of-range focal points before storage', () => {
    expect(cmsPageImageOptionsSchema.safeParse({ desktopRatio: '16:9;position:fixed' }).success).toBe(false);
    expect(cmsPageBlockSchema.safeParse({ id: 'image', type: 'image', props: { src: '/photo.jpg', desktopFocalPoint: { x: 1.1, y: 0.5 } } }).success).toBe(false);
    expect(cmsPageImagePresentation({ desktopRatio: '16:9', mobileRatio: '3:4', desktopFocalPoint: { x: 0.25, y: 0.7 }, mobileFocalPoint: { x: 0.8, y: 0.2 } }, 'image')).toMatchObject({ desktopAspectRatio: '16 / 9', mobileAspectRatio: '3 / 4', desktopObjectPosition: '25% 70%', mobileObjectPosition: '80% 20%' });
  });
});
