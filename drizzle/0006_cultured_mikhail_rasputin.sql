ALTER TABLE "clients" ADD COLUMN "template_key" varchar(60);--> statement-breakpoint
-- CD-01 backfill. Correct only because premium-v2 is the sole entry in
-- TEMPLATE_REGISTRY at this point in history, so "every realestate tenant
-- renders premium-v2" is a true statement today. A future second template
-- must not copy this pattern — assign per client instead.
UPDATE "clients" SET "template_key" = 'premium-v2'
  WHERE "vertical" = 'realestate' AND "template_key" IS NULL;