import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import type { ReportResourceType } from '@zenith/shared';
import { config } from '../../config';
import { db } from '../../db';
import {
  reportAssetTemplates,
  reportDashboards,
  reportDatasets,
  reportDatasources,
  reportFillTemplates,
  reportFolders,
  reportMetrics,
  reportPrintTemplates,
  users,
} from '../../db/schema';
import { currentUser, currentUserOrNull } from '../../lib/context';
import { formatDateTime } from '../../lib/datetime';
import { isPlatformAdmin } from '../../lib/tenant';
import type { DbExecutor } from '../../db/types';
import { reportCreateTenantId, reportScopedWhere } from './report-access';

export interface ReportResourceRecord {
  resourceType: ReportResourceType;
  id: number;
  tenantId: number | null;
  name: string;
  ownerId: number | null;
  folderId: number | null;
  createdBy: number | null;
  revision: number;
  status: string | null;
  updatedAt: Date;
  snapshot: Record<string, unknown>;
}

function commonSnapshot(row: {
  id: number;
  name: string;
  ownerId: number | null;
  folderId: number | null;
  status?: string | null;
}, revision: number): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    folderId: row.folderId,
    status: row.status ?? null,
    revision,
  };
}

export async function resolveReportResource(
  resourceType: ReportResourceType,
  id: number,
): Promise<ReportResourceRecord> {
  switch (resourceType) {
    case 'datasource': {
      const [row] = await db.select().from(reportDatasources)
        .where(reportScopedWhere(reportDatasources, eq(reportDatasources.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: 1, status: row.status, updatedAt: row.updatedAt,
        snapshot: { ...commonSnapshot(row, 1), type: row.type, remark: row.remark ?? null },
      };
    }
    case 'dataset': {
      const [row] = await db.select().from(reportDatasets)
        .where(reportScopedWhere(reportDatasets, eq(reportDatasets.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: 1, status: row.status, updatedAt: row.updatedAt,
        snapshot: {
          ...commonSnapshot(row, 1), datasourceId: row.datasourceId, type: row.type,
          content: row.content, fields: row.fields, params: row.params, computedFields: row.computedFields,
          cacheTtl: row.cacheTtl, materialize: row.materialize, rowRules: row.rowRules, remark: row.remark ?? null,
        },
      };
    }
    case 'dashboard': {
      const [row] = await db.select().from(reportDashboards)
        .where(reportScopedWhere(reportDashboards, eq(reportDashboards.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: row.revision, status: row.lifecycleStatus, updatedAt: row.updatedAt,
        snapshot: {
          ...commonSnapshot(row, row.revision), layout: row.layout, canvasLayout: row.canvasLayout,
          widgets: row.widgets, filters: row.filters, config: row.config, categoryId: row.categoryId ?? null,
          remark: row.remark ?? null,
        },
      };
    }
    case 'metric': {
      const [row] = await db.select().from(reportMetrics)
        .where(reportScopedWhere(reportMetrics, eq(reportMetrics.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: row.revision, status: row.lifecycleStatus, updatedAt: row.updatedAt,
        snapshot: {
          ...commonSnapshot(row, row.revision), code: row.code, description: row.description ?? null,
          type: row.type, datasetId: row.datasetId, sourceField: row.sourceField ?? null,
          formula: row.formula ?? null, aggregate: row.aggregate ?? null, dimensions: row.dimensions,
          timeField: row.timeField ?? null, unit: row.unit ?? null, format: row.format ?? null,
          caliber: row.caliber ?? null,
        },
      };
    }
    case 'print_template': {
      const [row] = await db.select().from(reportPrintTemplates)
        .where(reportScopedWhere(reportPrintTemplates, eq(reportPrintTemplates.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: 1, status: row.status, updatedAt: row.updatedAt,
        snapshot: {
          ...commonSnapshot(row, 1), datasetId: row.datasetId ?? null, content: row.content,
          params: row.params, pageConfig: row.pageConfig, remark: row.remark ?? null,
        },
      };
    }
    case 'fill_template': {
      const [row] = await db.select().from(reportFillTemplates)
        .where(reportScopedWhere(reportFillTemplates, eq(reportFillTemplates.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: row.revision, status: row.status, updatedAt: row.updatedAt,
        snapshot: {
          ...commonSnapshot(row, row.revision), code: row.code, description: row.description ?? null,
          formSchema: row.formSchema, workflowDefinitionId: row.workflowDefinitionId ?? null,
          needReview: row.needReview,
        },
      };
    }
    case 'asset_template': {
      const [row] = await db.select().from(reportAssetTemplates)
        .where(reportScopedWhere(reportAssetTemplates, eq(reportAssetTemplates.id, id))).limit(1);
      if (!row) break;
      return {
        resourceType, id: row.id, tenantId: row.tenantId ?? null, name: row.name,
        ownerId: row.ownerId ?? null, folderId: row.folderId ?? null, createdBy: row.createdBy ?? null,
        revision: row.version, status: row.status, updatedAt: row.updatedAt,
        snapshot: {
          ...commonSnapshot(row, row.version), code: row.code, type: row.type,
          description: row.description ?? null, content: row.content, previewFileId: row.previewFileId ?? null,
        },
      };
    }
  }
  throw new HTTPException(404, { message: '报表资源不存在' });
}

function sameTenant(left: number | null, right: number | null): boolean {
  return !config.multiTenantMode || left === right;
}

export async function ensureReportOwner(ownerId: number, tenantId: number | null): Promise<void> {
  const [owner] = await db.select({ id: users.id, tenantId: users.tenantId, status: users.status })
    .from(users).where(eq(users.id, ownerId)).limit(1);
  if (!owner || owner.status !== 'enabled') throw new HTTPException(400, { message: '资源负责人不存在或已停用' });
  const user = currentUserOrNull();
  const platformOwner = user && user.userId === ownerId && isPlatformAdmin(user);
  if (!platformOwner && !sameTenant(owner.tenantId ?? null, tenantId)) {
    throw new HTTPException(400, { message: '资源负责人与资源不属于同一租户' });
  }
}

export async function ensureReportFolder(
  folderId: number,
  resourceType: ReportResourceType,
  tenantId: number | null,
): Promise<void> {
  const [folder] = await db.select().from(reportFolders)
    .where(reportScopedWhere(reportFolders, eq(reportFolders.id, folderId))).limit(1);
  if (!folder || folder.status !== 'enabled') throw new HTTPException(400, { message: '资源目录不存在或已停用' });
  if (folder.resourceType !== resourceType) throw new HTTPException(400, { message: '资源目录类型不匹配' });
  if (!sameTenant(folder.tenantId ?? null, tenantId)) throw new HTTPException(400, { message: '资源目录与资源不属于同一租户' });
}

export async function validateReportResourcePlacement(
  resourceType: ReportResourceType,
  input: { ownerId?: number | null; folderId?: number | null; tenantId?: number | null },
): Promise<void> {
  const tenantId = input.tenantId === undefined ? reportCreateTenantId() : input.tenantId;
  await Promise.all([
    input.ownerId ? ensureReportOwner(input.ownerId, tenantId) : Promise.resolve(),
    input.folderId ? ensureReportFolder(input.folderId, resourceType, tenantId) : Promise.resolve(),
  ]);
}

export function defaultReportOwnerId(): number {
  return currentUser().userId;
}

export async function updateReportResourcePlacement(
  resourceType: ReportResourceType,
  id: number,
  input: { ownerId?: number | null; folderId?: number | null },
): Promise<ReportResourceRecord> {
  const resource = await resolveReportResource(resourceType, id);
  await validateReportResourcePlacement(resourceType, { ...input, tenantId: resource.tenantId });
  const changes = { ownerId: input.ownerId, folderId: input.folderId };
  switch (resourceType) {
    case 'datasource':
      await db.update(reportDatasources).set(changes).where(eq(reportDatasources.id, id));
      break;
    case 'dataset':
      await db.update(reportDatasets).set(changes).where(eq(reportDatasets.id, id));
      break;
    case 'dashboard':
      await db.update(reportDashboards).set(changes).where(eq(reportDashboards.id, id));
      break;
    case 'metric':
      await db.update(reportMetrics).set(changes).where(eq(reportMetrics.id, id));
      break;
    case 'print_template':
      await db.update(reportPrintTemplates).set(changes).where(eq(reportPrintTemplates.id, id));
      break;
    case 'fill_template':
      await db.update(reportFillTemplates).set(changes).where(eq(reportFillTemplates.id, id));
      break;
    case 'asset_template':
      await db.update(reportAssetTemplates).set(changes).where(eq(reportAssetTemplates.id, id));
      break;
  }
  return resolveReportResource(resourceType, id);
}

export async function setReportResourceOwner(
  executor: DbExecutor,
  resourceType: ReportResourceType,
  id: number,
  ownerId: number,
): Promise<void> {
  switch (resourceType) {
    case 'datasource':
      await executor.update(reportDatasources).set({ ownerId }).where(eq(reportDatasources.id, id));
      break;
    case 'dataset':
      await executor.update(reportDatasets).set({ ownerId }).where(eq(reportDatasets.id, id));
      break;
    case 'dashboard':
      await executor.update(reportDashboards).set({ ownerId }).where(eq(reportDashboards.id, id));
      break;
    case 'metric':
      await executor.update(reportMetrics).set({ ownerId }).where(eq(reportMetrics.id, id));
      break;
    case 'print_template':
      await executor.update(reportPrintTemplates).set({ ownerId }).where(eq(reportPrintTemplates.id, id));
      break;
    case 'fill_template':
      await executor.update(reportFillTemplates).set({ ownerId }).where(eq(reportFillTemplates.id, id));
      break;
    case 'asset_template':
      await executor.update(reportAssetTemplates).set({ ownerId }).where(eq(reportAssetTemplates.id, id));
      break;
  }
}

export function mapReportResourceSummary(resource: ReportResourceRecord) {
  return {
    resourceType: resource.resourceType,
    resourceId: resource.id,
    name: resource.name,
    ownerId: resource.ownerId,
    folderId: resource.folderId,
    status: resource.status,
    updatedAt: formatDateTime(resource.updatedAt),
  };
}
