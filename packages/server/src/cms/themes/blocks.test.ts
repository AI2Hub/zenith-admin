import { describe, expect, it } from 'vitest';
import { renderBlocksHtml } from './blocks';
import type { CmsPageBlock } from '@zenith/shared/cms';

const render = (blocks: CmsPageBlock[]) => renderBlocksHtml({ blocks, contentListData: new Map(), widgetData: new Map(), themeCode: 'default' });
describe('responsive page images and trusted block wrappers', () => {
  it('renders desktop/mobile sources and independent focal positions without embedding untrusted CSS', () => {
    const html = render([{ id: 'image-1', type: 'image', props: { src: '/desktop.jpg', mobileImage: '/mobile.jpg', imageDecorative: false, imageAlt: '文化节舞台', desktopRatio: '16:9', mobileRatio: '3:4', desktopFocalPoint: { x: 0.25, y: 0.6 }, mobileFocalPoint: { x: 0.8, y: 0.4 } } }]);
    expect(html).toMatch(/media="\(max-width: 768px\)" srcset="\/mobile.jpg"/iu);
    expect(html).toContain('alt="文化节舞台"'); expect(html).toContain('--pb-desktop-position:25% 60%'); expect(html).toContain('--pb-mobile-position:80% 40%');
    expect(html).toContain('--pb-desktop-ratio:16 / 9'); expect(html).toContain('--pb-mobile-ratio:3 / 4');
    expect(html).toContain('data-cms-page-block="true" data-cms-block-id="image-1"');
  });
  it('hides decorative pixels while preserving an accessible name for image links', () => {
    const html = render([{ id: 'cta', type: 'image', props: { src: '/cta.jpg', imageDecorative: true, imageAlt: '不应当输出的装饰图说明', linkUrl: '/schedule', linkLabel: '查看活动日程' } }]);
    expect(html).toContain('aria-label="查看活动日程"'); expect(html).toContain('aria-hidden="true"'); expect(html).toContain('alt=""');
    expect(html).not.toContain('不应当输出的装饰图说明');
  });
  it('escapes generated block identities and removes forged identity markers from rich text', () => {
    const html = render([{ id: 'block" data-fake="x', type: 'richtext', props: { html: '<p data-cms-page-block="true" data-cms-block-id="other" onclick="alert(1)">正文</p>' } }]);
    expect(html).toContain('data-cms-block-id="block&quot; data-fake=&quot;x"');
    expect(html.match(/data-cms-page-block="true"/gu)).toHaveLength(1); expect(html).not.toContain('data-cms-block-id="other"'); expect(html).not.toContain('onclick');
  });
});
