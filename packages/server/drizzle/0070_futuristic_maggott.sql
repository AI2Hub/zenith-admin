CREATE TABLE "workflow_task_urges" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"instance_id" integer NOT NULL,
	"urger_id" integer,
	"urger_name" varchar(64),
	"message" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_task_urges" ADD CONSTRAINT "workflow_task_urges_task_id_workflow_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."workflow_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_urges" ADD CONSTRAINT "workflow_task_urges_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_task_urges" ADD CONSTRAINT "workflow_task_urges_urger_id_users_id_fk" FOREIGN KEY ("urger_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;