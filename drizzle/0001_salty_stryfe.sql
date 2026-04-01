CREATE TABLE "contact_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_campaign_status" ADD COLUMN "priority" integer;--> statement-breakpoint
ALTER TABLE "outreach_touches" ADD COLUMN "gmail_thread_id" text;--> statement-breakpoint
ALTER TABLE "outreach_touches" ADD COLUMN "gmail_message_id" text;--> statement-breakpoint
ALTER TABLE "contact_emails" ADD CONSTRAINT "contact_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_emails_contact_email_idx" ON "contact_emails" USING btree ("contact_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_emails_email_unique_idx" ON "contact_emails" USING btree ("email");--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "is_prospect";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "is_poc";