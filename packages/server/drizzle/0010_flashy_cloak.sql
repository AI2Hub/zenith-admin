CREATE TABLE "user_group_roles" (
	"group_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "user_group_roles_group_id_role_id_pk" PRIMARY KEY("group_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "user_group_roles" ADD CONSTRAINT "user_group_roles_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_roles" ADD CONSTRAINT "user_group_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;