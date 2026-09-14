-- 「系统设置」下拆出「系统监控」目录（2750）：服务监控 2080 / 链路追踪 2720 / 日志文件 2150 搬入其中，
-- 「审计日志」（2120）只保留登录日志 / 操作日志 / 模拟登录记录；新页「异常日志」2760 由 @zenith/shared 种子新增。
-- 种子只新增不更新（seed.ts 的 onConflictDoNothing），已初始化的库需由本迁移建目录并搬动子菜单；
-- 按 id + 旧父级定位，管理后台已手工调整过的行不动，角色 / 用户对子菜单的授权原样保留并补上新目录。
INSERT INTO "menus" ("id", "parent_id", "title", "name", "icon", "type", "sort", "status", "visible", "created_at", "updated_at")
OVERRIDING SYSTEM VALUE
VALUES (2750, 2000, '系统监控', 'SystemMonitoring', 'Activity', 'directory', 5, 'enabled', true, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "menus"
SET "parent_id" = 2750, "sort" = 1, "icon" = 'Gauge', "updated_at" = now()
WHERE "id" = 2080 AND "parent_id" = 2000;
--> statement-breakpoint
UPDATE "menus"
SET "parent_id" = 2750, "sort" = 3, "updated_at" = now()
WHERE "id" = 2720 AND "parent_id" = 2120;
--> statement-breakpoint
UPDATE "menus"
SET "parent_id" = 2750, "sort" = 4, "updated_at" = now()
WHERE "id" = 2150 AND "parent_id" = 2120;
--> statement-breakpoint
UPDATE "menus"
SET "sort" = 3, "updated_at" = now()
WHERE "id" = 2740 AND "parent_id" = 2120 AND "sort" = 5;
--> statement-breakpoint
-- 已被授予任一搬动页面的角色 / 用户同时获得新目录，否则子页在侧栏树里不可见
INSERT INTO "role_menus" ("role_id", "menu_id")
SELECT DISTINCT rm."role_id", 2750 FROM "role_menus" rm WHERE rm."menu_id" IN (2080, 2720, 2150)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_menus" ("user_id", "menu_id")
SELECT DISTINCT um."user_id", 2750 FROM "user_menus" um WHERE um."menu_id" IN (2080, 2720, 2150)
ON CONFLICT DO NOTHING;