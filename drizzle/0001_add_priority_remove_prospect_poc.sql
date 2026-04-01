ALTER TABLE "contact_campaign_status" ADD COLUMN "priority" integer;
--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "is_prospect";
--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "is_poc";
