CREATE TABLE "user_dept_scopes" (
	"user_id" integer NOT NULL,
	"dept_id" integer NOT NULL,
	CONSTRAINT "user_dept_scopes_user_id_dept_id_pk" PRIMARY KEY("user_id","dept_id")
);
--> statement-breakpoint
CREATE TABLE "user_menus" (
	"user_id" integer NOT NULL,
	"menu_id" integer NOT NULL,
	CONSTRAINT "user_menus_user_id_menu_id_pk" PRIMARY KEY("user_id","menu_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_data_scope" "data_scope";--> statement-breakpoint
ALTER TABLE "user_dept_scopes" ADD CONSTRAINT "user_dept_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dept_scopes" ADD CONSTRAINT "user_dept_scopes_dept_id_departments_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_menus" ADD CONSTRAINT "user_menus_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_menus" ADD CONSTRAINT "user_menus_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;