/**
 * 接口目录数据面：把 `@zenith/shared` 从契约派生的目录转成契约响应形状，并附上权限码的注册表标签。
 *
 * 目录是构建期静态可知的（契约即代码），进程内算一次即缓存；前端不直接 import 契约聚合
 * （见 shared/permission-catalog-core 的说明），从这里取。
 */
import { CONTRACT_DOMAIN_LABELS } from '@zenith/shared/contracts';
import { permissionList, type OperationAccess } from '@zenith/shared/core';
import type { ApiCatalog, ApiCatalogItem } from '@zenith/shared/identity';
import { listApiCatalog } from '@zenith/shared/permission-catalog';
import { ALL_PERMISSIONS } from '@zenith/shared/permissions';

let cached: ApiCatalog | null = null;

/** 契约里的 access 带 readonly 数组与 Permission 字面量类型，转成响应 schema 的可序列化形状 */
function toAccess(access: OperationAccess | null): ApiCatalogItem['access'] {
  if (access === null || access === 'authenticated') return access;
  const permission: string[] | undefined = access.permission === undefined ? undefined : [...permissionList(access.permission)];
  return {
    ...(permission !== undefined ? { permission } : {}),
    // 契约允许写 platformOnly: false（等价缺省），响应里省略
    ...(access.platformOnly ? { platformOnly: access.platformOnly } : {}),
  };
}

export function getApiCatalog(): ApiCatalog {
  if (cached) return cached;
  const permissionLabels: Record<string, string> = {};
  const items: ApiCatalogItem[] = listApiCatalog().map((entry) => {
    for (const code of entry.permissions) {
      const label = ALL_PERMISSIONS[code]?.label;
      if (label) permissionLabels[code] = label;
    }
    return {
      domain: entry.domain,
      domainLabel: CONTRACT_DOMAIN_LABELS[entry.domain] ?? entry.domain,
      basePath: entry.basePath,
      name: entry.name,
      method: entry.method,
      fullPath: entry.fullPath,
      summary: entry.summary,
      description: entry.description,
      tags: [...entry.tags],
      deprecated: entry.deprecated,
      security: entry.security,
      access: toAccess(entry.access),
      accessKind: entry.accessKind,
      permissions: [...entry.permissions],
      platformOnly: entry.platformOnly,
      audit: entry.audit,
      feature: entry.feature,
    };
  });
  cached = { items, permissionLabels };
  return cached;
}
