ALTER TABLE "emails" ADD COLUMN "urgency_level" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "urgency_reason" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "urgency_source" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "restored_at" timestamp;