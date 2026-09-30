import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { cmsModelFieldViewSchema, type CmsModelField } from '@zenith/shared/cms';
import { cmsAssetVersions, cmsModelVersions } from '../../db/schema/cms-design';
import { cmsModels, cmsModelFields, cmsResources } from '../../db/schema/cms';
import type { DbExecutor } from '../../db/types';
import { requireRow } from '../../lib/db-assert';
import { pickEntity } from '../../lib/entity-map';
import { retainManagedFiles } from '../files/file-gc.service';
import { stableStringify } from '@zenith/shared/core';
import { compileCmsFieldDefinitions } from './cms-model-compiler';

export const cmsSnapshotHash = (value: unknown) => createHash('sha256').update(stableStringify(JSON.parse(JSON.stringify(value ?? null)))).digest('hex');
/** Database identities and edit timestamps do not change the published field contract. */
export const cmsModelDefinitionHash = (fields: readonly CmsModelField[]) => cmsSnapshotHash(fields.map(({ id: _id, modelId: _modelId, createdAt: _createdAt, updatedAt: _updatedAt, ...field }) => field));

export async function captureCmsModelVersion(tx: DbExecutor, modelId: number) {
  const [model] = await tx.select().from(cmsModels).where(eq(cmsModels.id, modelId)).for('update').limit(1);
  requireRow(model, '内容模型不存在');
  const rows = await tx.select().from(cmsModelFields).where(eq(cmsModelFields.modelId, modelId)).orderBy(asc(cmsModelFields.sort), asc(cmsModelFields.id));
  const { fields } = await compileCmsFieldDefinitions(tx, rows.map(row => pickEntity(cmsModelFieldViewSchema, row)), { ownerSiteId: model.ownerSiteId });
  const contentHash = cmsModelDefinitionHash(fields);
  const [previous] = await tx.select().from(cmsModelVersions).where(eq(cmsModelVersions.modelId, modelId)).orderBy(desc(cmsModelVersions.version)).limit(1);
  if (previous?.contentHash === contentHash) {
    if (model.hasUnpublishedChanges) await tx.update(cmsModels).set({ hasUnpublishedChanges: false }).where(eq(cmsModels.id, modelId));
    return previous;
  }
  const [version] = await tx.insert(cmsModelVersions).values({ modelId, version: (previous?.version ?? 0) + 1, fields, contentHash }).returning();
  await tx.update(cmsModels).set({ publishedVersionId: version.id, hasUnpublishedChanges: false }).where(eq(cmsModels.id, modelId));
  return version;
}

export async function ensureCmsAssetVersion(tx: DbExecutor, resourceId: number, siteId: number) {
  const [resource] = await tx.select().from(cmsResources).where(and(eq(cmsResources.id, resourceId), eq(cmsResources.siteId, siteId))).for('update').limit(1);
  requireRow(resource, '素材不存在或不属于当前站点');
  const value = { url: resource.url, thumbUrl: resource.thumbUrl, fileId: resource.fileId, mimeType: resource.mimeType, width: resource.width, height: resource.height, size: resource.size };
  const hash = cmsSnapshotHash(value);
  const [previous] = await tx.select().from(cmsAssetVersions).where(eq(cmsAssetVersions.resourceId, resourceId)).orderBy(desc(cmsAssetVersions.version)).limit(1);
  if (previous?.contentHash === hash) return previous;
  const [version] = await tx.insert(cmsAssetVersions).values({ ...value, resourceId, siteId, version: (previous?.version ?? 0) + 1, contentHash: hash }).returning();
  if (version.fileId) await retainManagedFiles(tx, [version.fileId]);
  return version;
}
