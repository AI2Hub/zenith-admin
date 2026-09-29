import { readCmsGenerationSnapshot } from './cms-generation-read';
import { desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { QueryOutputOf } from '@zenith/shared/core';
import { cmsConfigurationMatches, cmsWorkbenchContract, type CmsConfigurationObjectKind, type CmsConfigurationState } from '@zenith/shared/cms';
import { withDbExecutor } from '../../db';
import type { DbTransaction } from '../../db/types';
import { cmsReleases } from '../../db/schema';
import { requireRow } from '../../lib/db-assert';
import { buildWhere } from '../../lib/where-helpers';
import { hasPermission } from '../../lib/context';
import { formatNullableDateTime } from '../../lib/datetime';
import { assertSiteAccess } from './cms-sites.service';
import { cmsGenerationSchemaName } from './cms-generation-storage.service';
import { cmsReleaseScope } from './cms-release-access.service';

const TABLES = { site: 'cms_sites', page: 'cms_pages', widget: 'cms_widgets' } as const;
const PERMISSIONS = { site: 'cms:site:list', page: 'cms:page:list', widget: 'cms:widget:list' } as const;
async function rawConfiguration(tx: DbTransaction, siteId: number, kind: CmsConfigurationObjectKind, objectId: number, generationId: number | null) {
  const schema = generationId ? cmsGenerationSchemaName(generationId) : 'public';
  const table = generationId && kind === 'site' ? 'cms_site_projection' : TABLES[kind];
  const [row] = await tx.execute<{ data: Record<string, unknown> }>(sql`select to_jsonb(t) as data from ${sql.identifier(schema)}.${sql.identifier(table)} t where t.id=${objectId} ${kind === 'site' ? sql`` : sql`and t.site_id=${siteId}`} limit 1`);
  if (!row) return null;
  if (kind !== 'site') return row.data;
  const [inheritance] = await tx.execute<{ data: Record<string, unknown> }>(sql`select to_jsonb(t) as data from ${sql.identifier(schema)}.cms_site_inheritances t where t.site_id=${siteId} limit 1`);
  return { ...row.data, inheritance: inheritance?.data ?? {} };
}

export async function getCmsConfigurationState(query: QueryOutputOf<typeof cmsWorkbenchContract.configurationState>): Promise<CmsConfigurationState> {
  const kind = query.kind ?? 'site'; const objectId = kind === 'site' ? query.siteId : query.objectId!;
  if (!await hasPermission(PERMISSIONS[kind])) throw new HTTPException(403, { message: '没有查看当前配置对象的权限' });
  await assertSiteAccess(query.siteId);
  return readCmsGenerationSnapshot(query.siteId, (tx, generationId) => withDbExecutor(tx, async () => {
    const current = requireRow(await rawConfiguration(tx, query.siteId, kind, objectId, null), '配置对象不存在或不属于本站');
    const published = generationId ? await rawConfiguration(tx, query.siteId, kind, objectId, generationId) : null;
    const result: CmsConfigurationState = { siteId: query.siteId, kind, objectId, state: cmsConfigurationMatches(kind, current, published) ? 'online' : 'saved', generationId, hasPublished: published !== null,
      savedAt: formatNullableDateTime(typeof current.updated_at === 'string' ? current.updated_at : null), release: null };
    if (result.state === 'online') return result;

    // State is independent of release visibility. Only a release the user may open becomes a link.
    const mayViewRelease = await hasPermission('cms:publish:view');
    const releaseScope = mayViewRelease ? await cmsReleaseScope(query.siteId) : sql`false`;
    let cursor: number | null = null; let hasPending = false; let hasMatchingLink = false;
    for (;;) {
      const releases = await tx.select({ id: cmsReleases.id, name: cmsReleases.name, status: cmsReleases.status, baseGenerationId: cmsReleases.baseGenerationId,
        permitted: sql<boolean>`(${releaseScope})`,
        captured: sql<Record<string, unknown> | null>`(select item from jsonb_array_elements(coalesce(${cmsReleases.configurationSnapshot}->'tables'->${TABLES[kind]},'[]'::jsonb)) item where (item->>'id')::integer=${objectId} limit 1)`,
        inheritance: sql<Record<string, unknown> | null>`(select item from jsonb_array_elements(coalesce(${cmsReleases.configurationSnapshot}->'tables'->'cms_site_inheritances','[]'::jsonb)) item where (item->>'site_id')::integer=${query.siteId} limit 1)`,
      }).from(cmsReleases).where(buildWhere(eq(cmsReleases.siteId, query.siteId), inArray(cmsReleases.status, ['draft', 'building', 'ready', 'scheduled', 'failed']),
        sql`${cmsReleases.configurationItems} @> ${JSON.stringify([{ kind, id: objectId }])}::jsonb`, cursor !== null ? lt(cmsReleases.id, cursor) : undefined,
      )).orderBy(desc(cmsReleases.id)).limit(20);
      if (!releases.length) break;
      for (const release of releases) {
        const captured = release.captured && kind === 'site' ? { ...release.captured, inheritance: release.inheritance ?? published?.inheritance ?? {} } : release.captured;
        const matchesSaved = release.baseGenerationId === generationId && cmsConfigurationMatches(kind, current, captured);
        const pending = matchesSaved && release.status !== 'failed';
        if (pending) hasPending = true;
        if (mayViewRelease && release.permitted && (!result.release || (!hasMatchingLink && pending))) {
          result.release = { id: release.id, name: release.name, status: release.status, matchesSaved, href: `/cms/publishing?tab=releases&site=${query.siteId}&release=${release.id}` };
          hasMatchingLink = pending;
        }
      }
      if (hasPending && (!mayViewRelease || hasMatchingLink)) break;
      cursor = releases.at(-1)!.id;
    }
    result.state = hasPending ? 'pending' : 'saved';
    return result;
  }));
}
