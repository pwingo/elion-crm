CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"campaign_group" text,
	"date" text,
	"location" text,
	"description" text NOT NULL,
	"selling_points" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"cadence_days" text DEFAULT '[5, 7, 10, 14]',
	"max_touches" integer DEFAULT 4,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_campaign_status" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"status" text DEFAULT 'not_started',
	"next_touch_date" text,
	"do_not_contact" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization" text NOT NULL,
	"title" text,
	"email" text,
	"linkedin_url" text,
	"owner" text NOT NULL,
	"is_prospect" boolean DEFAULT false,
	"is_poc" boolean DEFAULT false,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outreach_touches" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"touch_number" integer,
	"channel" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"draft_created_at" timestamp,
	"sent_at" timestamp,
	"subject" text,
	"body" text,
	"created_by" text NOT NULL,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"google_access_token" text,
	"google_refresh_token" text,
	"owner_name" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "voice_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"archetype" text,
	"subject" text,
	"body" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "contact_campaign_status" ADD CONSTRAINT "contact_campaign_status_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_campaign_status" ADD CONSTRAINT "contact_campaign_status_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_touches" ADD CONSTRAINT "outreach_touches_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_touches" ADD CONSTRAINT "outreach_touches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_examples" ADD CONSTRAINT "voice_examples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_campaign_unique_idx" ON "contact_campaign_status" USING btree ("contact_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_draft_idx" ON "outreach_touches" USING btree ("contact_id","campaign_id") WHERE state = 'drafted';