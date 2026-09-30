import { describe, expect, it } from 'vitest';
import { cmsTranslationContentKey, cmsTranslationSourceChanged } from './translation-content';
import type { CmsContentRevisionSnapshot } from './content-revision';

const source: Partial<CmsContentRevisionSnapshot> = {
  title: '城市文化指南', summary: '参观信息', body: '<p>周二开放</p>',
  bodyDocument: { schemaVersion: 1, nodes: [{ id: 'paragraph-1', kind: 'element', tag: 'p', attributes: {}, children: [{ id: 'text-1', kind: 'text', text: '周二开放' }] }] },
  extend: { opening: '09:00', price: 20 }, ownerId: 1, dueAt: '2026-10-01 09:00:00',
};

describe('CMS translation source baseline', () => {
  it('ignores revision metadata, operational changes and document node identities', () => {
    const current = structuredClone(source);
    current.ownerId = 2; current.editor = '新责任编辑'; current.dueAt = '2026-10-05 09:00:00';
    current.scheduledAt = '2026-10-06 09:00:00'; current.isTop = true; current.sort = 10;
    current.sourceRevisionId = 999; current.modelVersionId = 7; current.assetVersions = { '1': 8 };
    current.bodyDocument!.nodes[0].id = 'new-node-id';
    expect(cmsTranslationSourceChanged(current, source)).toBe(false);
  });

  it('detects changed source text and structured business facts without requiring a checkpoint', () => {
    expect(cmsTranslationSourceChanged({ ...source, summary: '新的参观信息' }, source)).toBe(true);
    expect(cmsTranslationSourceChanged({ ...source, extend: { ...source.extend, price: 30 } }, source)).toBe(true);
    const current = structuredClone(source);
    const paragraph = current.bodyDocument!.nodes[0];
    if (paragraph.kind === 'element') paragraph.children = [{ id: 'text-1', kind: 'text', text: '周三开放' }];
    expect(cmsTranslationSourceChanged(current, source)).toBe(true);
  });

  it('compares translated media labels while ignoring binary URLs and related object IDs', () => {
    const baseline: Partial<CmsContentRevisionSnapshot> = { ...source,
      bodyDocument: { schemaVersion: 1, nodes: [{ id: 'image', kind: 'element', tag: 'img', attributes: { src: '/old.jpg', alt: '文化馆' }, children: [] }] },
      mediaData: { images: [{ url: '/old.jpg', caption: '展馆入口' }] },
      attachments: [{ name: '参观指南', url: '/old.pdf', size: 1, ext: 'pdf', sort: 0 }],
      extend: { photo: 'cms-res://1', related: [1], intro: '简介' },
    };
    const fields = [{ name: 'photo', fieldType: 'image' as const }, { name: 'related', fieldType: 'references' as const }, { name: 'intro', fieldType: 'text' as const }];
    const current = structuredClone(baseline);
    const image = current.bodyDocument!.nodes[0];
    if (image.kind === 'element') image.attributes.src = '/new.jpg';
    current.mediaData!.images![0].url = '/new.jpg';
    current.attachments![0].url = '/new.pdf';
    current.extend = { photo: 'cms-res://2', related: [2], intro: '简介' };
    expect(cmsTranslationSourceChanged(current, baseline, fields)).toBe(false);
    current.mediaData!.images![0].caption = '展馆北门';
    expect(cmsTranslationSourceChanged(current, baseline, fields)).toBe(true);
    current.mediaData!.images![0].caption = '展馆入口';
    if (image.kind === 'element') image.attributes.alt = '新的展馆说明';
    expect(cmsTranslationSourceChanged(current, baseline, fields)).toBe(true);
  });

  it('normalizes JSON object ordering and checks nested component values', () => {
    expect(cmsTranslationContentKey({ ...source, extend: { price: 20, opening: '09:00' } })).toBe(cmsTranslationContentKey(source));
    const fields = [{ name: 'sections', fieldType: 'array' as const, configuration: { fields: [{ name: 'heading', label: '标题', fieldType: 'text' as const }] } }];
    expect(cmsTranslationSourceChanged({ extend: { sections: [{ heading: '新标题' }] } }, { extend: { sections: [{ heading: '原标题' }] } }, fields)).toBe(true);
  });

  it('does not claim a translation without a source baseline is current', () => {
    expect(cmsTranslationSourceChanged(source, null)).toBe(true);
  });
});
