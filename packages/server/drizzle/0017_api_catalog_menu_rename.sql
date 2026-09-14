-- 内置菜单 1110「接口权限矩阵」改为「接口目录」：路径 / 组件 / 名称 / 图标随 @zenith/shared 种子同步，
-- 按钮 1111 的权限码 system:permission-matrix:view → system:api-catalog:view。
-- 种子只新增不更新（seed.ts 的 onConflictDoNothing），已初始化的库需由本迁移改写；
-- 按 id 定位并只在仍为旧值时更新，角色 / 用户对这两行的授权（role_menus / user_menus）原样保留。
UPDATE "menus"
SET "title" = '接口目录',
    "name" = 'SystemApiCatalog',
    "path" = '/system/api-catalog',
    "component" = 'system/api-catalog/ApiCatalogPage',
    "icon" = 'ListTree',
    "updated_at" = now()
WHERE "id" = 1110 AND "component" = 'system/permission-matrix/PermissionMatrixPage';
--> statement-breakpoint
UPDATE "menus"
SET "permission" = 'system:api-catalog:view',
    "updated_at" = now()
WHERE "id" = 1111 AND "permission" = 'system:permission-matrix:view';
