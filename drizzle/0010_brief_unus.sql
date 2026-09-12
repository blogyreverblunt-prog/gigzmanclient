CREATE TABLE "client_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_api_keys_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
ALTER TABLE "queries" ADD COLUMN "external_id" varchar(64);--> statement-breakpoint
ALTER TABLE "client_api_keys" ADD CONSTRAINT "client_api_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_client_external_id_unique" UNIQUE("client_id","external_id");