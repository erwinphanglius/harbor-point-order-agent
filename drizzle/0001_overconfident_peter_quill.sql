ALTER TABLE "audit_log" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "issues_json" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "notes_json" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "change_proposal_json" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "duplicate_of_email_id" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD COLUMN "price_source" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "rejected_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_order_lines_so_line_idx" ON "sales_order_lines" USING btree ("so_number","line_no");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_dedupe_key_unique" UNIQUE("dedupe_key");