ALTER TABLE "identity_access_requests" ADD CONSTRAINT "identity_access_requests_workflow_unique" UNIQUE("workflow_instance_id");
-- 清理早期独立权限申请实现产生的业务数据与三套外部流程定义。
DELETE FROM "identity_access_grant_menus";
DELETE FROM "identity_access_grants";
DELETE FROM "identity_access_review_items";
DELETE FROM "identity_access_review_campaigns";
DELETE FROM "identity_access_request_items";
DELETE FROM "identity_access_requests";
DELETE FROM "workflow_instances" WHERE "definition_id" IN (5, 6, 7);
DELETE FROM "workflow_definitions" WHERE "id" IN (5, 6, 7);
DELETE FROM "role_menus" WHERE "menu_id" = 4210;
DELETE FROM "menus" WHERE "id" = 4210;
