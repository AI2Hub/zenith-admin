CREATE TABLE "tenant_package_menus" (
	"package_id" integer NOT NULL,
	"menu_id" integer NOT NULL,
	CONSTRAINT "tenant_package_menus_package_id_menu_id_pk" PRIMARY KEY("package_id","menu_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" "status" DEFAULT 'enabled' NOT NULL,
	"remark" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_packages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "package_id" integer;--> statement-breakpoint
ALTER TABLE "tenant_package_menus" ADD CONSTRAINT "tenant_package_menus_package_id_tenant_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."tenant_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_package_menus" ADD CONSTRAINT "tenant_package_menus_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_packages" ADD CONSTRAINT "tenant_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_packages" ADD CONSTRAINT "tenant_packages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_package_id_tenant_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."tenant_packages"("id") ON DELETE set null ON UPDATE no action;