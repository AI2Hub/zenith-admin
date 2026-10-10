CREATE TABLE "numbering_allocations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "numbering_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scene" varchar(64) NOT NULL,
	"tenant_id" integer,
	"owner_key" varchar(128) NOT NULL,
	"allocation_key" varchar(200) NOT NULL,
	"business_key" varchar(128),
	"rule_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"number" varchar(128) NOT NULL,
	"unique_namespace" varchar(64) NOT NULL,
	"unique_scope" varchar(256) NOT NULL,
	"context_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbering_allocations_operation_unique" UNIQUE NULLS NOT DISTINCT("scene","tenant_id","owner_key","allocation_key"),
	CONSTRAINT "numbering_allocations_number_unique" UNIQUE("unique_namespace","unique_scope","number")
);
--> statement-breakpoint
CREATE TABLE "numbering_bindings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "numbering_bindings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scene" varchar(64) NOT NULL,
	"owner_key" varchar(128) DEFAULT '*' NOT NULL,
	"rule_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"tenant_id" integer,
	"parameter_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbering_bindings_scene_owner_tenant_unique" UNIQUE NULLS NOT DISTINCT("scene","owner_key","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "numbering_counters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "numbering_counters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_id" integer NOT NULL,
	"scope_key" varchar(256) NOT NULL,
	"period_key" varchar(16) NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "numbering_counters_rule_scope_period_unique" UNIQUE("rule_id","scope_key","period_key")
);
--> statement-breakpoint
CREATE TABLE "numbering_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "numbering_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"scene" varchar(64) NOT NULL,
	"description" text,
	"tenant_id" integer,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"draft" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbering_rules_tenant_code_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "numbering_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "numbering_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_id" integer NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbering_versions_rule_version_unique" UNIQUE("rule_id","version")
);
--> statement-breakpoint
ALTER TABLE "numbering_allocations" ADD CONSTRAINT "numbering_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_allocations" ADD CONSTRAINT "numbering_allocations_rule_id_numbering_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."numbering_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_allocations" ADD CONSTRAINT "numbering_allocations_version_id_numbering_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."numbering_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_bindings" ADD CONSTRAINT "numbering_bindings_rule_id_numbering_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."numbering_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_bindings" ADD CONSTRAINT "numbering_bindings_version_id_numbering_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."numbering_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_bindings" ADD CONSTRAINT "numbering_bindings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_bindings" ADD CONSTRAINT "numbering_bindings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_bindings" ADD CONSTRAINT "numbering_bindings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_counters" ADD CONSTRAINT "numbering_counters_rule_id_numbering_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."numbering_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_rules" ADD CONSTRAINT "numbering_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_rules" ADD CONSTRAINT "numbering_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_rules" ADD CONSTRAINT "numbering_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_versions" ADD CONSTRAINT "numbering_versions_rule_id_numbering_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."numbering_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_versions" ADD CONSTRAINT "numbering_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_versions" ADD CONSTRAINT "numbering_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "numbering_allocations_rule_created_idx" ON "numbering_allocations" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "numbering_rules_scene_idx" ON "numbering_rules" USING btree ("scene");