import { ALL_PERMISSIONS } from '@zenith/shared/permissions';
import { SEED_MENUS } from '@zenith/shared/seed/menus';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { menus } from '../../db/schema';
import { getTenantPackageFeatureSet } from '../../lib/tenant-package';

const featuresByPermission = new Map<string, Array<string | null>>();
for (const menu of SEED_MENUS) {
  if (!menu.permission) continue;
  const features = featuresByPermission.get(menu.permission) ?? [];
  features.push(menu.featureKey ?? null);
  featuresByPermission.set(menu.permission, features);
}

/** Feature boundaries come from the code catalogue, never mutable navigation metadata. */
export async function availablePermissionCodes(codes: readonly string[], tenantId: number | null, tx: DbExecutor = db): Promise<string[]> {
  const features = await getTenantPackageFeatureSet(tenantId, tx);
  return [...new Set(codes)].filter(code => {
    if (!ALL_PERMISSIONS[code]) return false;
    const required = featuresByPermission.get(code) ?? [];
    return !features || required.some(feature => feature === null || features.has(feature));
  }).sort();
}

/** Menus only project already-authorized codes into navigable UI. */
export async function navigationForPermissions(codes: readonly string[], tx: DbExecutor = db): Promise<number[]> {
  const rows = await tx.select({ id: menus.id, parentId: menus.parentId, permission: menus.permission, status: menus.status }).from(menus);
  const index = new Map(rows.map(row => [row.id, row]));
  const allowed = new Set(codes);
  const result = new Set<number>();
  for (const row of rows) {
    if (!row.permission || !allowed.has(row.permission) || row.status !== 'enabled') continue;
    const visited = new Set<number>();
    let next: typeof row | undefined = row;
    const ancestors: number[] = [];
    while (next && !visited.has(next.id) && next.status === 'enabled') {
      ancestors.push(next.id); visited.add(next.id); next = index.get(next.parentId);
    }
    if (next && next.status !== 'enabled') continue;
    ancestors.forEach(id => result.add(id));
  }
  return [...result];
}
