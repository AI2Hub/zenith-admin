import {
  buildCmsPagePresetInstance, cmsPagePresetContract, validateCmsPagePresetDefinition,
  type CmsPagePresetUsage, type CmsPagePresetVersion,
} from '@zenith/shared/cms';
import { mock, MockHttpError } from '../utils/contract';
import { requireItem } from '../utils/crud';
import { badRequest, conflict, notFound } from '../utils/handlers';
import { mockDateTime } from '../utils/date';
import { mockCmsPages, mockCmsSites } from '../data/cms';
import { addMockCmsPagePresetVersion, createMockCmsPagePreset, mockCmsPagePresets, mockCmsPagePresetVersions } from '../data/cms-page-presets';

function getVersion(id: number, version?: number): CmsPagePresetVersion {
  const preset = requireItem(mockCmsPagePresets, id, '组合预设不存在', { status: 404 });
  const snapshot = mockCmsPagePresetVersions.find(item => item.presetId === id && item.version === (version ?? preset.currentVersion));
  if (!snapshot) throw new MockHttpError(notFound('组合版本不存在', { status: 404 }));
  return snapshot;
}

export const cmsPagePresetHandlers = [
  mock(cmsPagePresetContract.list, ({ query, ok }) => {
    requireItem(mockCmsSites, query.siteId, '站点不存在', { status: 404 });
    return ok(mockCmsPagePresets.filter(item => item.siteId === query.siteId).toSorted((a, b) => b.id - a.id));
  }),
  mock(cmsPagePresetContract.detail, ({ params, ok }) => ok(structuredClone(getVersion(params.id)))),
  mock(cmsPagePresetContract.create, ({ body, ok }) => {
    requireItem(mockCmsSites, body.siteId, '站点不存在', { status: 404 });
    validateCmsPagePresetDefinition(body.blocks, body.parameters);
    return ok(createMockCmsPagePreset(body));
  }),
  mock(cmsPagePresetContract.versions, ({ params, ok }) => {
    requireItem(mockCmsPagePresets, params.id, '组合预设不存在', { status: 404 });
    return ok(mockCmsPagePresetVersions.filter(item => item.presetId === params.id).toSorted((a, b) => b.version - a.version)
      .map(item => ({ id: item.id, presetId: item.presetId, siteId: item.siteId, version: item.version, name: item.name, description: item.description, note: item.note, createdAt: item.createdAt })));
  }),
  mock(cmsPagePresetContract.version, ({ params, ok }) => ok(structuredClone(getVersion(params.id, params.version)))),
  mock(cmsPagePresetContract.saveVersion, ({ params, body, ok }) => {
    const preset = requireItem(mockCmsPagePresets, params.id, '组合预设不存在', { status: 404 });
    if (preset.currentVersion !== body.expectedVersion) return conflict('预设已有新版本，请刷新后重新保存', { status: 409 });
    validateCmsPagePresetDefinition(body.blocks, body.parameters);
    Object.assign(preset, { name: body.name, description: body.description ?? null, currentVersion: preset.currentVersion + 1,
      blockCount: body.blocks.length, updatedAt: mockDateTime(), updatedBy: 1 });
    addMockCmsPagePresetVersion(preset, body.blocks, body.parameters, body.note ?? null);
    return ok(preset);
  }),
  mock(cmsPagePresetContract.copy, ({ params, body, ok }) => {
    const source = getVersion(params.id);
    return ok(createMockCmsPagePreset({ ...source, name: body.name }));
  }),
  mock(cmsPagePresetContract.usages, ({ params, ok }) => {
    const preset = requireItem(mockCmsPagePresets, params.id, '组合预设不存在', { status: 404 });
    const result: CmsPagePresetUsage[] = [];
    for (const page of mockCmsPages.filter(item => item.siteId === preset.siteId)) {
      const instances = new Map<string, CmsPagePresetUsage>();
      for (const block of page.blocks) {
        const source = block.presetSource;
        if (!source || source.presetId !== preset.id) continue;
        const current = instances.get(source.instanceId);
        if (current) current.blockIds.push(block.id);
        else instances.set(source.instanceId, { pageId: page.id, pageName: page.name, pageSlug: page.slug,
          instanceId: source.instanceId, sourceVersion: source.version, latestVersion: preset.currentVersion,
          blockIds: [block.id], canUpgrade: source.version < preset.currentVersion,
        });
      }
      result.push(...instances.values());
    }
    return ok(result);
  }),
  mock(cmsPagePresetContract.instantiate, ({ params, body, ok }) => {
    const version = getVersion(params.id, body.version);
    try { return ok({ blocks: buildCmsPagePresetInstance(version, body.values, `preset_${crypto.randomUUID().replaceAll('-', '')}`) }); }
    catch (error) { return badRequest(error instanceof Error ? error.message : '组合参数无效', { status: 400 }); }
  }),
];
