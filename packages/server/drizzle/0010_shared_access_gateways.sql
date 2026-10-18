-- Reset the seeded permission workflow so def-5 gets the shared-default-branch layout:
-- both optional gates fall through to the shared 风险校验失败 node, and critical_gateway
-- keeps exactly one default branch as the engine invariant requires.
DELETE FROM "workflow_instances" WHERE "definition_id" = 5;
DELETE FROM "workflow_definitions" WHERE "id" = 5;
