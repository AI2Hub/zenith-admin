import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../db/types';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../../db', () => ({ db: { select: mocks.select } }));

import { cmsPagePresetVersions, cmsResourceRefs, cmsResources } from '../../db/schema';
import { CMS_RESOURCE_OWNER_FIELDS, listCmsResourceRefDetails, syncCmsResourceRefs } from './cms-resource-refs.service';

function resourceExecutor(resources: Array<{ id: number; siteId: number }>) {
  const deleted = vi.fn(async (_condition: SQL) => undefined);
  const inserted = vi.fn(() => ({ onConflictDoNothing: async () => undefined }));
  const selected = vi.fn(async () => resources);
  const from = vi.fn(() => ({ where: selected }));
  const executor = {
    select: vi.fn(() => ({ from })),
    delete: vi.fn(() => ({ where: deleted })),
    insert: vi.fn(() => ({ values: inserted })),
  };
  return { executor: executor as unknown as DbExecutor, deleted, inserted, selected, from };
}

beforeEach(() => { vi.clearAllMocks(); mocks.select.mockReset(); });

describe('CMS 页面预设版本资源引用', () => {
  it('protects resources in immutable blocks and parameter defaults stored in block properties', async () => {
    const { executor, deleted, inserted, from } = resourceExecutor([{ id: 11, siteId: 3 }, { id: 12, siteId: 3 }, { id: 13, siteId: 3 }]);
    const version = {
      id: 901, presetId: 9, siteId: 3, version: 2, name: '仅标题 cms-res://99',
      blocks: [
        { id: 'hero', type: 'banner', props: { image: 'cms-res://11', mobileImage: 'cms-res://12' } },
        { id: 'gallery', type: 'gallery', props: { images: [{ url: 'cms-res://13' }, { url: 'cms-res://11' }] } },
      ],
      parameters: [{ key: 'cover', label: '封面图片', blockId: 'hero', field: 'image' }],
    };

    await syncCmsResourceRefs(executor, 'page_preset_version', version.id, version.siteId, version);

    expect(CMS_RESOURCE_OWNER_FIELDS.page_preset_version).toEqual(['blocks']);
    expect(from).toHaveBeenCalledWith(cmsResources);
    // 只替换当前版本的引用，不能清掉同一预设的历史版本或其他站点引用。
    expect(new PgDialect().sqlToQuery(deleted.mock.calls[0][0]).params).toEqual([3, 'page_preset_version', 901]);
    expect(inserted).toHaveBeenCalledWith([11, 12, 13].map((resourceId) => ({
      siteId: 3, resourceId, ownerType: 'page_preset_version', ownerId: 901, field: 'blocks',
    })));
  });

  it('rejects a resource from another site before inserting preset references', async () => {
    const { executor, inserted } = resourceExecutor([{ id: 11, siteId: 4 }]);
    await expect(syncCmsResourceRefs(executor, 'page_preset_version', 901, 3, {
      blocks: [{ props: { image: 'cms-res://11' } }],
    })).rejects.toThrow('素材句柄不属于当前站点');
    expect(inserted).not.toHaveBeenCalled();
  });

  it('shows the retained version name in resource usage and scopes metadata to its site', async () => {
    const where = vi.fn(async (table: unknown, condition: SQL) => {
      const compiled = new PgDialect().sqlToQuery(condition);
      expect(compiled.params).toContain(3);
      if (table === cmsResourceRefs) return [{ ownerType: 'page_preset_version', ownerId: 901, field: 'blocks' }];
      expect(table).toBe(cmsPagePresetVersions);
      expect(compiled.params).toContain(901);
      return [{ id: 901, title: '活动专题', version: 2 }];
    });
    mocks.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: (condition: SQL) => where(table, condition) }) }));

    const refs = await listCmsResourceRefDetails(11, 3);

    expect(refs).toEqual([expect.objectContaining({ kind: 'page_preset_version', id: 901, title: '活动专题（版本 2）', field: 'blocks' })]);
    expect(where).toHaveBeenCalledTimes(2);
  });
});
