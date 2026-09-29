/**
 * 可视化搭建区块渲染器（主题无关）：
 * 每个区块类型对应一个渲染组件，renderBlocksHtml 输出整段 HTML 交给主题 customPage 模板包裹。
 * 区块样式内联 <style>（.pb-* 前缀），静态页零外部依赖。
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { CSSProperties } from 'react';
import { cmsPageImagePresentation, isValidCmsAssetUrl, isDirectCmsHref, type CmsPageBlock } from '@zenith/shared/cms';
import type { CmsContentItem } from './types';
import { sanitizeCmsHtml } from '../../services/cms/cms-html-sanitizer';
import type { CmsResolvedWidget } from '@zenith/shared/cms';
import { CMS_WIDGET_STYLES, renderCmsWidgetHtml } from './widgets';
import { resolveThemeWidgetRenderer } from './registry';
import { PublishedDate } from './_shared';

export const BLOCK_STYLES = `
.pb-hero { position: relative; overflow: hidden; text-align: center; padding: 64px 24px; border-radius: 12px; background: var(--bg-2); margin-bottom: 32px; }
.pb-hero h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
.pb-hero p { color: var(--text-2); font-size: 16px; margin-top: 10px; max-width: 620px; margin-left: auto; margin-right: auto; }
.pb-hero.pb-hero-image { color: #fff; padding: 0; }
.pb-hero-shade { position: absolute; inset: 0; background: linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58)); pointer-events: none; }
.pb-hero-content { position: relative; }
.pb-hero-image .pb-hero-content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 24px; }
.pb-hero.pb-hero-image h1 { color: #fff; text-shadow: 0 1px 6px rgba(0,0,0,.5); }
.pb-hero.pb-hero-image p { color: rgba(255,255,255,.9); text-shadow: 0 1px 4px rgba(0,0,0,.5); }
.pb-hero .pb-btn { display: inline-block; margin-top: 20px; background: var(--primary); color: #fff; border-radius: 8px; padding: 10px 28px; font-size: 15px; }
.pb-richtext { margin-bottom: 32px; font-size: 15px; }
.pb-richtext p { margin: 12px 0; }
.pb-image { margin-bottom: 32px; text-align: center; }
.pb-image a { display: block; }
.pb-picture { display: block; position: relative; overflow: hidden; aspect-ratio: var(--pb-desktop-ratio,auto); }
.pb-picture img { display: block; width: 100%; height: auto; object-fit: cover; object-position: var(--pb-desktop-position,50% 50%); }
.pb-picture.pb-crop-desktop img { position: absolute; inset: 0; height: 100%; }
.pb-image .pb-picture { border-radius: 10px; }
.pb-section-title { font-size: 20px; font-weight: 700; margin: 0 0 14px; }
.pb-content-list { margin-bottom: 32px; }
.pb-content-list .pb-item { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.pb-content-list .pb-item a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-content-list .pb-item time { color: var(--text-2); font-size: 12px; flex-shrink: 0; }
.pb-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
.pb-columns .pb-col { border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
.pb-columns .pb-col h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.pb-columns .pb-col p { font-size: 13.5px; color: var(--text-2); }
@media (max-width: 768px) {
  .pb-hero { padding: 40px 16px; } .pb-hero h1 { font-size: 26px; } .pb-hero-image .pb-hero-content { padding: 16px; }
  .pb-picture { aspect-ratio: var(--pb-mobile-ratio,auto); }
  .pb-picture img,.pb-picture.pb-crop-desktop img { position: static; height: auto; object-position: var(--pb-mobile-position,50% 50%); }
  .pb-picture.pb-crop-mobile img { position: absolute; inset: 0; height: 100%; }
}
`;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function BlockPicture({ props, type }: { props: Record<string, unknown>; type: 'hero' | 'image' }) {
  const source = str(type === 'hero' ? props.image : props.src);
  if (!source || !isValidCmsAssetUrl(source)) return null;
  const image = cmsPageImagePresentation(props, type);
  const mobile = image.mobileImage && isValidCmsAssetUrl(image.mobileImage) ? image.mobileImage : undefined;
  const style = { '--pb-desktop-ratio': image.desktopAspectRatio, '--pb-mobile-ratio': image.mobileAspectRatio, '--pb-desktop-position': image.desktopObjectPosition, '--pb-mobile-position': image.mobileObjectPosition } as CSSProperties;
  return <picture className={`pb-picture${image.desktopRatio !== 'auto' ? ' pb-crop-desktop' : ''}${image.mobileRatio !== 'auto' ? ' pb-crop-mobile' : ''}`} style={style} aria-hidden={image.imageDecorative ? true : undefined}>
    {mobile ? <source media="(max-width: 768px)" srcSet={mobile} /> : null}
    <img src={source} alt={image.imageDecorative ? '' : image.imageAlt} loading={type === 'hero' ? 'eager' : 'lazy'} />
  </picture>;
}

function HeroBlock({ props }: { props: Record<string, unknown> }) {
  const image = str(props.image) && isValidCmsAssetUrl(str(props.image));
  return (
    <section
      className={`pb-hero${image ? ' pb-hero-image' : ''}`}
    >
      {image ? <><BlockPicture props={props} type="hero" /><span className="pb-hero-shade" aria-hidden="true" /></> : null}
      <div className="pb-hero-content">
      <h1>{str(props.title)}</h1>
      {str(props.subtitle) ? <p>{str(props.subtitle)}</p> : null}
      {str(props.buttonText) && isDirectCmsHref(str(props.buttonUrl)) ? (
        <a className="pb-btn" href={str(props.buttonUrl)}>{str(props.buttonText)}</a>
      ) : null}
      </div>
    </section>
  );
}

function RichtextBlock({ props }: { props: Record<string, unknown> }) {
  return <section className="pb-richtext" dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(str(props.html)) }} />;
}

function ImageBlock({ props }: { props: Record<string, unknown> }) {
  const image = cmsPageImagePresentation(props, 'image');
  const img = <BlockPicture props={props} type="image" />;
  return (
    <section className="pb-image">
      {str(props.linkUrl) && isDirectCmsHref(str(props.linkUrl)) ? <a href={str(props.linkUrl)} aria-label={image.imageDecorative ? image.linkLabel : undefined}>{img}</a> : img}
    </section>
  );
}

function ContentListBlock({ props, items }: { props: Record<string, unknown>; items: CmsContentItem[] }) {
  return (
    <section className="pb-content-list">
      {str(props.title) ? <h2 className="pb-section-title">{str(props.title)}</h2> : null}
      {items.length === 0 ? <div style={{ color: 'var(--text-2)', fontSize: 14 }}>暂无内容</div> : items.map((item) => (
        <div className="pb-item" key={item.id}>
          <a href={item.url}>{item.title}</a>
          <PublishedDate value={item.publishedAt} />
        </div>
      ))}
    </section>
  );
}

function ColumnsBlock({ props }: { props: Record<string, unknown> }) {
  const items = Array.isArray(props.items) ? props.items as { title?: string; description?: string }[] : [];
  return (
    <section className="pb-columns">
      {items.map((col, i) => (
        <div className="pb-col" key={`${col.title ?? ''}-${i}`}>
          <h3>{col.title ?? ''}</h3>
          {col.description ? <p>{col.description}</p> : null}
        </div>
      ))}
    </section>
  );
}

export interface BlockRenderInput {
  blocks: CmsPageBlock[];
  /** content-list 区块的数据（key = block.id），由 render service 预取 */
  contentListData: Map<string, CmsContentItem[]>;
  /** widget-ref 区块的数据（key = block.id），由 render service 批量解析 */
  widgetData: Map<string, CmsResolvedWidget>;
  themeCode: string;
}

/** 渲染全部区块为 HTML 字符串（含区块样式 <style>） */
export function renderBlocksHtml({ blocks, contentListData, widgetData, themeCode }: BlockRenderInput): string {
  const rendered = blocks.map((block) => {
    let html: string;
    switch (block.type) {
      case 'hero':
        html = renderToStaticMarkup(<HeroBlock props={block.props} />);
        break;
      case 'richtext':
        html = renderToStaticMarkup(<RichtextBlock props={block.props} />);
        break;
      case 'image':
        html = renderToStaticMarkup(<ImageBlock props={block.props} />);
        break;
      case 'content-list':
        html = renderToStaticMarkup(<ContentListBlock props={block.props} items={contentListData.get(block.id) ?? []} />);
        break;
      case 'columns':
        html = renderToStaticMarkup(<ColumnsBlock props={block.props} />);
        break;
      case 'widget-ref': {
        const widget = widgetData.get(block.id);
        const renderer = widget
          ? resolveThemeWidgetRenderer(themeCode, widget.type, widget.rendererKey)
          : null;
        html = widget && renderer ? renderCmsWidgetHtml(widget, renderer, { includeStyles: false }) : '';
        break;
      }
      default:
        html = '';
    }
    return renderToStaticMarkup(<div data-cms-page-block="true" data-cms-block-id={block.id} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />);
  }).join('\n');
  const widgetStyles = widgetData.size > 0 ? CMS_WIDGET_STYLES : '';
  return `<style>${BLOCK_STYLES}${widgetStyles}</style>\n${rendered}`;
}
