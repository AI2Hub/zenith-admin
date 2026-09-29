import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cmsConfigurationStateQuery } from '@zenith/shared/cms';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cmsReleases, cmsSiteGenerations } from '../../db/schema';

const state = vi.hoisted(() => ({ permission: vi.fn(), access: vi.fn(), scope: vi.fn(), current: {} as Record<string, unknown>, online: null as Record<string, unknown> | null, releases: [] as Record<string, unknown>[], snapshots: vi.fn() }));
vi.mock('../../lib/context', () => ({ hasPermission: state.permission }));
vi.mock('./cms-sites.service', () => ({ assertSiteAccess: state.access }));
vi.mock('./cms-release-access.service', () => ({ cmsReleaseScope: state.scope }));
vi.mock('./cms-generation-storage.service', () => ({ cmsGenerationSchemaName: (id: number) => `cms_generation_${id}` }));
vi.mock('./cms-generation-read', () => ({ readCmsGenerationSnapshot: state.snapshots }));
vi.mock('../../db', () => ({ readSnapshot: state.snapshots, withDbExecutor: (_tx: unknown, fn: () => unknown) => fn() }));
import { getCmsConfigurationState } from './cms-configuration-state.service';

describe('configuration state authorization and source of truth', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.permission.mockImplementation(async (permission: string) => permission === 'cms:page:list'); state.access.mockResolvedValue(undefined);
    state.current = { id: 4, site_id: 1, name: '最新保存', blocks: [{ id: 'photo', props: { src: 'cms-res://40' } }] };
    state.online = { ...state.current, name: '线上旧版' }; state.releases = [];
    const dialect = new PgDialect(); let readReleases = false;
    const tx = { execute: async (statement: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const query = dialect.sqlToQuery(statement).sql;
      expect(query).not.toContain('cms_resources');
      const row = query.includes('"public"') ? state.current : state.online;
      return row ? [{ data: row }] : [];
    }, select: () => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => table === cmsSiteGenerations ? [{ id: 8 }] : [],
      orderBy: () => ({ limit: async () => { expect(table).toBe(cmsReleases); if (readReleases) return []; readReleases = true; return state.releases; } }),
    }) }) }) };
    state.snapshots.mockImplementation(async (_siteId: number, fn: (executor: typeof tx, generationId: number) => unknown) => fn(tx, 8));
  });
  it('does not infer online from an absent or invisible personal draft', async () => {
    const query = cmsConfigurationStateQuery.parse({ siteId: 1, kind: 'page', objectId: 4 });
    expect(await getCmsConfigurationState(query)).toMatchObject({ state: 'saved', release: null, generationId: 8 });
  });
  it('reports matching other-operator pending configuration while withholding its unauthorized release link', async () => {
    state.releases = [{ id: 22, name: '另一个操作者的发布单', status: 'ready', baseGenerationId: 8, permitted: false, captured: state.current, inheritance: null }];
    expect(await getCmsConfigurationState(cmsConfigurationStateQuery.parse({ siteId: 1, kind: 'page', objectId: 4 }))).toMatchObject({ state: 'pending', release: null });
    expect(state.scope).not.toHaveBeenCalled();
  });
  it('recognizes online only from matching frozen raw values and blocks cross-module reads', async () => {
    state.online = { ...state.current, updated_at: 'yesterday' };
    expect(await getCmsConfigurationState(cmsConfigurationStateQuery.parse({ siteId: 1, kind: 'page', objectId: 4 }))).toMatchObject({ state: 'online', hasPublished: true });
    await expect(getCmsConfigurationState(cmsConfigurationStateQuery.parse({ siteId: 1, kind: 'widget', objectId: 4 }))).rejects.toMatchObject({ status: 403 });
  });
  it('links an authorized matching release, and distinguishes a stale base from a publishable draft', async () => {
    state.permission.mockResolvedValue(true); state.scope.mockResolvedValue(sql`true`);
    state.releases = [{ id: 22, name: '共享发布单', status: 'ready', baseGenerationId: 8, permitted: true, captured: state.current, inheritance: null }];
    const result = await getCmsConfigurationState(cmsConfigurationStateQuery.parse({ siteId: 1, kind: 'page', objectId: 4 }));
    expect(result).toMatchObject({ state: 'pending', release: { id: 22, matchesSaved: true, href: '/cms/publishing?tab=releases&site=1&release=22' } });
  });
  it('does not describe an old candidate as containing the current publishable configuration', async () => {
    state.permission.mockResolvedValue(true); state.scope.mockResolvedValue(sql`true`);
    state.releases = [{ id: 21, name: '过时发布单', status: 'ready', baseGenerationId: 7, permitted: true, captured: state.current, inheritance: null }];
    expect(await getCmsConfigurationState(cmsConfigurationStateQuery.parse({ siteId: 1, kind: 'page', objectId: 4 }))).toMatchObject({ state: 'saved', release: { id: 21, matchesSaved: false } });
  });
});
