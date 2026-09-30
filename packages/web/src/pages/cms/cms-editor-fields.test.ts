import { describe, expect, it } from 'vitest';
import type { CmsModelField } from '@zenith/shared/cms';
import { mockCmsModels } from '@/mocks/data/cms';
import { cmsEditorFieldLabel, getCmsEditorFieldLocation, normalizeCmsEditorFieldPath } from './cms-editor-fields';

const fieldBase = mockCmsModels.flatMap((model) => model.fields ?? [])[0];

describe('CMS 质量问题编辑定位', () => {
  it('routes stored field paths to the correct form tab and media control', () => {
    expect(getCmsEditorFieldLocation('seoTitle')).toEqual({ label: 'SEO 标题', field: 'seoTitle', sideTab: 'seo' });
    expect(getCmsEditorFieldLocation('externalLink', [], 'link')).toEqual({ label: '链接地址', field: 'externalLink', sideTab: undefined });
    expect(getCmsEditorFieldLocation('externalLink', [], 'article')?.sideTab).toBe('advanced');
    expect(getCmsEditorFieldLocation('mediaData.poster', [], 'media')?.field).toBe('mediaPoster');
    expect(getCmsEditorFieldLocation('mediaData.images.0.caption', [], 'album')?.field).toBe('mediaData.images');
    expect(getCmsEditorFieldLocation('body.node-id')?.field).toBe('body');
    expect(getCmsEditorFieldLocation('body.node-id', [], 'link')).toBeNull();
  });

  it('uses frozen component labels and the selected block definition for repeated child names', () => {
    const field: CmsModelField = { ...fieldBase, name: 'sections', label: '内容区块', fieldType: 'blocks', configuration: { blockTypes: [
      { code: 'hero', label: '头图', fields: [{ name: 'text', label: '头图标题', fieldType: 'text' }] },
      { code: 'quote', label: '引用', fields: [{ name: 'text', label: '引文', fieldType: 'text' }] },
    ] } };
    const location = getCmsEditorFieldLocation('extend.sections[1].text', [field], 'article', { sections: [{ blockType: 'hero' }, { blockType: 'quote' }] });
    expect(location).toEqual({ label: '内容区块 / 第 2 项 / 引文', field: 'extend.sections.1.text' });
    expect(normalizeCmsEditorFieldPath('extend.sections[1].text')).toBe(location?.field);
  });

  it('does not offer a missing field as a jump target and gives generic dependencies a visible destination', () => {
    expect(getCmsEditorFieldLocation('extend.removed')).toBeNull();
    expect(cmsEditorFieldLabel('extend.removed')).toBe('模型字段');
    expect(getCmsEditorFieldLocation('extend')?.field).toBe('modelId');
    expect(getCmsEditorFieldLocation('extend', [fieldBase])?.field).toBe('extend');
    expect(getCmsEditorFieldLocation('assetVersions.123')).toBeNull();
    expect(cmsEditorFieldLabel(null)).toBe('整篇稿件');
  });
});
