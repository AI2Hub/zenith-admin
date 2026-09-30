ALTER TABLE "cms_content_working_copies" ADD COLUMN "publication_hash" varchar(32) GENERATED ALWAYS AS (md5(( snapshot  - ARRAY['ownerId','dueAt','scheduledAt','translationOfId','sourceRevisionId','bodyDocument']::text[])::text)) STORED;--> statement-breakpoint
ALTER TABLE "cms_content_working_copies" ADD COLUMN "published_hash" varchar(32);--> statement-breakpoint
UPDATE "cms_content_working_copies" AS working
SET "published_hash" = md5((revision.snapshot - ARRAY['ownerId','dueAt','scheduledAt','translationOfId','sourceRevisionId','bodyDocument']::text[])::text)
FROM "cms_content_revisions" AS revision
WHERE revision.id = working.published_revision_id;
