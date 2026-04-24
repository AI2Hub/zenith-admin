import { workflowDefinitions } from '../db/schema';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapDefinition(
  row: typeof workflowDefinitions.$inferSelect,
  createdByName?: string | null,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    flowData: row.flowData,
    formFields: row.formFields,
    status: row.status,
    version: row.version,
    tenantId: row.tenantId,
    createdBy: row.createdBy,
    createdByName: createdByName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
