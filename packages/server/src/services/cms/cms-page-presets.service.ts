import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type * as z from 'zod';
import {
  buildCmsPagePresetInstance, cmsPagePresetSchema, cmsPagePresetVersionSchema, cmsPagePresetVersionSummarySchema,
  resolveCmsPagePresetValues, validateCmsPagePresetDefinition, validateCmsPagePresetSources,
  type CmsPageBlock, type CmsPagePresetUsage,
  type createCmsPagePresetSchema, type saveCmsPagePresetVersionSchema,
  type instantiateCmsPagePresetSchema, type copyCmsPagePresetSchema, type cmsPagePresetContract,
} from '@zenith/shared/cms';
import type { QueryOutputOf } from '@zenith/shared/core';
import { db } from '../../db';
import { cmsChannels, cmsPagePresets, cmsPagePresetVersions, cmsPages, cmsWidgets } from '../../db/schema';
import type { CmsPagePresetRow, CmsPagePresetVersionRow } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { requireRow } from '../../lib/db-assert';
import { pickEntity } from '../../lib/entity-map';
import { assertSiteAccess, ensureCmsSiteExists } from './cms-sites.service';
import { lockCmsSiteForMutation } from './cms-site-publish-lock.service';
import { sanitizeCmsPageBlocks } from './cms-page-blocks';
import { canonicalizeCmsResourceContent, resolveCmsResourcePayload, syncCmsResourceRefs } from './cms-resource-refs.service';
import { decorateCmsPageBlocksBatch } from './cms-page-acl.service';

const versionSummaryColumns = {
  id: cmsPagePresetVersions.id, presetId: cmsPagePresetVersions.presetId, siteId: cmsPagePresetVersions.siteId,
  version: cmsPagePresetVersions.version, name: cmsPagePresetVersions.name,
  description: cmsPagePresetVersions.description, note: cmsPagePresetVersions.note, createdAt: cmsPagePresetVersions.createdAt,
};

function asBadRequest(error: unknown): never {
  if (error instanceof HTTPException) throw error;
  throw new HTTPException(400, { message: error instanceof Error ? error.message : '页面组合参数无效' });
}

async function ensureCmsPagePreset(id: number): Promise<CmsPagePresetRow> {
  const [row] = await db.select().from(cmsPagePresets).where(eq(cmsPagePresets.id, id)).limit(1);
  requireRow(row, '页面组合不存在');
  await assertSiteAccess(row.siteId);
  return row;
}

async function loadVersion(executor: DbExecutor, preset: Pick<CmsPagePresetRow, 'id' | 'siteId'>, version: number) {
  const [row] = await executor.select().from(cmsPagePresetVersions).where(and(
    eq(cmsPagePresetVersions.presetId, preset.id), eq(cmsPagePresetVersions.siteId, preset.siteId), eq(cmsPagePresetVersions.version, version),
  )).limit(1);
  return requireRow(row, '页面组合版本不存在');
}

async function versionView(row: CmsPagePresetVersionRow) {
  return resolveCmsResourcePayload(pickEntity(cmsPagePresetVersionSchema, row), row.siteId);
}

export async function listCmsPagePresets(query: QueryOutputOf<typeof cmsPagePresetContract.list>) {
  await ensureCmsSiteExists(query.siteId);
  await assertSiteAccess(query.siteId);
  const rows = await db.select().from(cmsPagePresets).where(eq(cmsPagePresets.siteId, query.siteId)).orderBy(desc(cmsPagePresets.updatedAt), desc(cmsPagePresets.id));
  return rows.map(row => pickEntity(cmsPagePresetSchema, row));
}

export async function getCmsPagePreset(id: number) {
  const preset = await ensureCmsPagePreset(id);
  return versionView(await loadVersion(db, preset, preset.currentVersion));
}

export async function getCmsPagePresetVersion(id: number, version: number) {
  const preset = await ensureCmsPagePreset(id);
  return versionView(await loadVersion(db, preset, version));
}

export async function listCmsPagePresetVersions(id: number) {
  const preset = await ensureCmsPagePreset(id);
  const rows = await db.select(versionSummaryColumns).from(cmsPagePresetVersions).where(and(
    eq(cmsPagePresetVersions.presetId, id), eq(cmsPagePresetVersions.siteId, preset.siteId),
  )).orderBy(desc(cmsPagePresetVersions.version));
  return rows.map(row => pickEntity(cmsPagePresetVersionSummarySchema, row));
}

/** Named referenced entities remain in this site; media identity is checked by syncCmsResourceRefs. */
async function assertPresetTargets(executor: DbExecutor, siteId: number, blocks: CmsPageBlock[]) {
  const channelCodes = [...new Set(blocks.filter(block => block.type === 'content-list' && block.props.channelCode).map(block => String(block.props.channelCode)))];
  if (channelCodes.length) {
    const rows = await executor.select({ code: cmsChannels.code }).from(cmsChannels).where(and(eq(cmsChannels.siteId, siteId), inArray(cmsChannels.code, channelCodes)));
    if (rows.length !== channelCodes.length) throw new HTTPException(400, { message: '组合栏目不存在或不属于本站' });
  }
  const widgetIds = [...new Set(blocks.filter(block => block.type === 'widget-ref').map(block => Number(block.props.widgetId)))];
  if (widgetIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new HTTPException(400, { message: '组合引用部件无效' });
  if (widgetIds.length) {
    const rows = await executor.select({ id: cmsWidgets.id }).from(cmsWidgets).where(and(eq(cmsWidgets.siteId, siteId), inArray(cmsWidgets.id, widgetIds)));
    if (rows.length !== widgetIds.length) throw new HTTPException(400, { message: '组合引用部件不存在或不属于本站' });
  }
}

async function prepareDefinition(executor: DbExecutor, siteId: number, input: Pick<z.output<typeof createCmsPagePresetSchema>, 'blocks' | 'parameters'>) {
  // A saved composition owns its own block identities, never nested instance provenance or ACL decorations.
  const blocks = sanitizeCmsPageBlocks(input.blocks).map(({ presetSource: _source, ...block }) => block);
  try {
    validateCmsPagePresetDefinition(blocks, input.parameters);
    resolveCmsPagePresetValues({ blocks, parameters: input.parameters }, {});
  } catch (error) { asBadRequest(error); }
  await assertPresetTargets(executor, siteId, blocks);
  return { blocks: await canonicalizeCmsResourceContent(executor, siteId, blocks), parameters: input.parameters };
}

async function insertVersion(executor: DbExecutor, preset: CmsPagePresetRow, definition: Awaited<ReturnType<typeof prepareDefinition>>, note: string | null) {
  const [version] = await executor.insert(cmsPagePresetVersions).values({
    presetId: preset.id, siteId: preset.siteId, version: preset.currentVersion,
    name: preset.name, description: preset.description, ...definition, note,
  }).returning();
  await syncCmsResourceRefs(executor, 'page_preset_version', version.id, preset.siteId, version);
}

export async function createCmsPagePreset(input: z.output<typeof createCmsPagePresetSchema>) {
  await ensureCmsSiteExists(input.siteId);
  await assertSiteAccess(input.siteId);
  return db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, input.siteId);
    const definition = await prepareDefinition(tx, input.siteId, input);
    const [preset] = await tx.insert(cmsPagePresets).values({
      siteId: input.siteId, name: input.name, description: input.description ?? null, blockCount: definition.blocks.length,
    }).returning();
    await insertVersion(tx, preset, definition, null);
    return pickEntity(cmsPagePresetSchema, preset);
  });
}

export async function saveCmsPagePresetVersion(id: number, input: z.output<typeof saveCmsPagePresetVersionSchema>) {
  const initial = await ensureCmsPagePreset(id);
  return db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, initial.siteId);
    const [current] = await tx.select().from(cmsPagePresets).where(and(eq(cmsPagePresets.id, id), eq(cmsPagePresets.siteId, initial.siteId))).for('update').limit(1);
    requireRow(current, '页面组合不存在');
    if (current.currentVersion !== input.expectedVersion) throw new HTTPException(409, { message: '组合已被其他编辑者更新，请刷新版本后重试' });
    const definition = await prepareDefinition(tx, current.siteId, input);
    const [preset] = await tx.update(cmsPagePresets).set({
      name: input.name, description: input.description ?? null,
      currentVersion: current.currentVersion + 1, blockCount: definition.blocks.length,
    }).where(and(eq(cmsPagePresets.id, id), eq(cmsPagePresets.currentVersion, input.expectedVersion))).returning();
    requireRow(preset, '组合已被其他编辑者更新', 409);
    await insertVersion(tx, preset, definition, input.note ?? null);
    return pickEntity(cmsPagePresetSchema, preset);
  });
}

export async function copyCmsPagePreset(id: number, input: z.output<typeof copyCmsPagePresetSchema>) {
  const initial = await ensureCmsPagePreset(id);
  return db.transaction(async tx => {
    await lockCmsSiteForMutation(tx, initial.siteId);
    const [current] = await tx.select().from(cmsPagePresets).where(and(eq(cmsPagePresets.id, id), eq(cmsPagePresets.siteId, initial.siteId))).for('update').limit(1);
    requireRow(current, '页面组合不存在');
    const source = await loadVersion(tx, current, current.currentVersion);
    const [preset] = await tx.insert(cmsPagePresets).values({
      siteId: current.siteId, name: input.name, description: current.description, blockCount: source.blocks.length,
    }).returning();
    await insertVersion(tx, preset, { blocks: source.blocks, parameters: source.parameters }, `复制自组合 #${id} v${source.version}`);
    return pickEntity(cmsPagePresetSchema, preset);
  });
}

export async function instantiateCmsPagePreset(id: number, input: z.output<typeof instantiateCmsPagePresetSchema>) {
  const preset = await ensureCmsPagePreset(id);
  const version = await loadVersion(db, preset, input.version);
  let blocks: CmsPageBlock[];
  try { blocks = sanitizeCmsPageBlocks(buildCmsPagePresetInstance(version, input.values, randomUUID())); }
  catch (error) { asBadRequest(error); }
  await assertPresetTargets(db, preset.siteId, blocks);
  return resolveCmsResourcePayload({ blocks }, preset.siteId);
}

/** Called within the page write transaction; props can diverge locally without falsifying provenance. */
export async function assertCmsPagePresetSources(executor: DbExecutor, siteId: number, blocks: CmsPageBlock[]) {
  const ids = [...new Set(blocks.flatMap(block => block.presetSource ? [block.presetSource.presetId] : []))];
  if (!ids.length) return;
  const versionNumbers = [...new Set(blocks.flatMap(block => block.presetSource ? [block.presetSource.version] : []))];
  const versions = await executor.select({
    presetId: cmsPagePresetVersions.presetId, siteId: cmsPagePresetVersions.siteId, version: cmsPagePresetVersions.version,
    blocks: cmsPagePresetVersions.blocks, parameters: cmsPagePresetVersions.parameters,
  }).from(cmsPagePresetVersions).where(and(
    eq(cmsPagePresetVersions.siteId, siteId), inArray(cmsPagePresetVersions.presetId, ids), inArray(cmsPagePresetVersions.version, versionNumbers),
  ));
  try { validateCmsPagePresetSources(blocks, versions, siteId); } catch (error) { asBadRequest(error); }
}

export async function listCmsPagePresetUsages(id: number): Promise<CmsPagePresetUsage[]> {
  const preset = await ensureCmsPagePreset(id);
  // Project only identity/provenance from potentially large page JSON; content props never leave the DB.
  const pages = await db.select({
    id: cmsPages.id, name: cmsPages.name, slug: cmsPages.slug,
    blocks: sql<CmsPageBlock[]>`coalesce((select jsonb_agg(jsonb_build_object('id', item->>'id', 'presetSource', item->'presetSource')) from jsonb_array_elements(${cmsPages.blocks}) as item where item->'presetSource'->>'presetId' = ${String(id)}), '[]'::jsonb)`,
  }).from(cmsPages).where(and(eq(cmsPages.siteId, preset.siteId), sql`${cmsPages.blocks} @> ${JSON.stringify([{ presetSource: { presetId: id } }])}::jsonb`)).orderBy(cmsPages.id);
  const decorated = await decorateCmsPageBlocksBatch(pages);
  return pages.flatMap(page => {
    const groups = new Map<string, CmsPagePresetUsage>();
    for (const block of decorated.get(page.id) ?? []) {
      const source = block.presetSource!;
      let group = groups.get(source.instanceId);
      if (!group) {
        group = { pageId: page.id, pageName: page.name, pageSlug: page.slug, instanceId: source.instanceId, sourceVersion: source.version, latestVersion: preset.currentVersion, blockIds: [], canUpgrade: source.version < preset.currentVersion };
        groups.set(source.instanceId, group);
      }
      group.blockIds.push(block.id);
      group.canUpgrade &&= block.canManage === true;
    }
    return [...groups.values()];
  });
}
