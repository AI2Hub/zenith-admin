import { SEED_TENANT_PACKAGES } from '@zenith/shared';
import type { TenantPackage } from '@zenith/shared';

let nextTenantPackageId = Math.max(...SEED_TENANT_PACKAGES.map((p) => p.id)) + 1;
export function getNextTenantPackageId() { return nextTenantPackageId++; }

export const mockTenantPackages: TenantPackage[] = SEED_TENANT_PACKAGES.map((p) => ({
  ...p,
  menuIds: p.menuIds ?? [],
  menuCount: (p.menuIds ?? []).length,
}));
