-- 「应用版本」（2670）从「系统设置」根下搬入「系统运维」目录（2440），与新页「应用部署」（2770，由 @zenith/shared 种子新增）相邻：
-- 两页共同构成应用交付——应用版本管应用 / 版本 / 制品，应用部署管目标 / 记录 / 备份。
-- 种子只新增不更新（seed.ts 的 onConflictDoNothing），已初始化的库由本迁移搬动菜单；按 id + 旧父级定位，管理后台已手工调整过的行不动。
UPDATE "menus"
SET "parent_id" = 2440, "sort" = 15, "updated_at" = now()
WHERE "id" = 2670 AND "parent_id" = 2000;
--> statement-breakpoint
-- 已被授予「应用版本」的角色 / 用户同时获得「系统运维」目录，否则该页在侧栏树里不可见
INSERT INTO "role_menus" ("role_id", "menu_id")
SELECT DISTINCT rm."role_id", 2440 FROM "role_menus" rm WHERE rm."menu_id" = 2670
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_menus" ("user_id", "menu_id")
SELECT DISTINCT um."user_id", 2440 FROM "user_menus" um WHERE um."menu_id" = 2670
ON CONFLICT DO NOTHING;
