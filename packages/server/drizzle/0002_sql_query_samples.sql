CREATE TABLE "sql_query_samples" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sql_query_samples_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"database_name" varchar(128) NOT NULL,
	"query_id" varchar(64) NOT NULL,
	"query" text NOT NULL,
	"calls" bigint DEFAULT 0 NOT NULL,
	"total_ms" double precision DEFAULT 0 NOT NULL,
	"mean_ms" double precision DEFAULT 0 NOT NULL,
	"rows" bigint DEFAULT 0 NOT NULL,
	"shared_blks_hit" bigint DEFAULT 0 NOT NULL,
	"shared_blks_read" bigint DEFAULT 0 NOT NULL,
	"temp_blks_read" bigint DEFAULT 0 NOT NULL,
	"temp_blks_written" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sql_query_samples_at_idx" ON "sql_query_samples" USING btree ("sampled_at");--> statement-breakpoint
CREATE INDEX "sql_query_samples_query_time_idx" ON "sql_query_samples" USING btree ("query_id","sampled_at");