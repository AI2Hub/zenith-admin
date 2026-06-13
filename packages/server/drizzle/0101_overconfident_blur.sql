CREATE TYPE "public"."ssh_auth_type" AS ENUM('password', 'key_path', 'key_content', 'agent');--> statement-breakpoint
CREATE TABLE "ssh_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer DEFAULT 22 NOT NULL,
	"username" varchar(128) NOT NULL,
	"auth_type" "ssh_auth_type" DEFAULT 'password' NOT NULL,
	"password_encrypted" text,
	"key_path" text,
	"key_content_encrypted" text,
	"key_passphrase_encrypted" text,
	"env_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order_num" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ssh_profiles" ADD CONSTRAINT "ssh_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_recordings" DROP COLUMN "size_bytes";