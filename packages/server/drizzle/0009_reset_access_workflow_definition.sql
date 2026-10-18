-- Reset the seeded permission workflow so the current custom definition replaces the early branchless version.
DELETE FROM "workflow_instances" WHERE "definition_id" = 5;
DELETE FROM "workflow_definitions" WHERE "id" = 5;
