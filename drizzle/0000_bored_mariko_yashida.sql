CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email_id" text,
	"actor" text DEFAULT 'agent' NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	CONSTRAINT "customer_contacts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_prices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_prices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" text NOT NULL,
	"sku" text NOT NULL,
	"unit_price" numeric NOT NULL,
	"valid_from" text NOT NULL,
	"valid_to" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"payment_terms" text,
	"credit_limit" numeric,
	"open_balance" numeric,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emails" (
	"email_id" text PRIMARY KEY NOT NULL,
	"received_at" text NOT NULL,
	"from_name" text,
	"from_email" text NOT NULL,
	"to" text,
	"subject" text,
	"body" text NOT NULL,
	"attachments" text DEFAULT '[]' NOT NULL,
	"classification" text,
	"disposition" text,
	"review_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incoming_supply" (
	"supplier_po" text NOT NULL,
	"sku" text NOT NULL,
	"qty" numeric NOT NULL,
	"expected_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory" (
	"sku" text PRIMARY KEY NOT NULL,
	"on_hand" numeric NOT NULL,
	"allocated" numeric NOT NULL,
	"available" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"sku" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"sell_uom" text,
	"pack" text,
	"list_price" numeric,
	"status" text NOT NULL,
	"replaced_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "review_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email_id" text NOT NULL,
	"so_number" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'awaiting_release' NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_order_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"so_number" text NOT NULL,
	"line_no" integer NOT NULL,
	"sku" text NOT NULL,
	"qty_ordered" numeric NOT NULL,
	"qty_shipped" numeric DEFAULT '0' NOT NULL,
	"unit_price" numeric
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_orders" (
	"so_number" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"ship_to_id" text,
	"customer_po" text,
	"order_date" text NOT NULL,
	"requested_date" text,
	"status" text NOT NULL,
	"draft" boolean DEFAULT true NOT NULL,
	"created_by_agent" boolean DEFAULT false NOT NULL,
	"released_at" timestamp,
	"source_email_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ship_to_addresses" (
	"ship_to_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_customer_id_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_so_number_sales_orders_so_number_fk" FOREIGN KEY ("so_number") REFERENCES "public"."sales_orders"("so_number") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_ship_to_id_ship_to_addresses_ship_to_id_fk" FOREIGN KEY ("ship_to_id") REFERENCES "public"."ship_to_addresses"("ship_to_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ship_to_addresses" ADD CONSTRAINT "ship_to_addresses_customer_id_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
