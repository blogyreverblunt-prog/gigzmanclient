ALTER TABLE "clients" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- CD-02 backfill. Reproduces, exactly, the five Set<string> allowlists this
-- migration replaces (lib/premium-v2/home-sections.ts, lib/vastu/enabled.ts,
-- lib/home-loan/enabled.ts). All five keys are written explicitly on all five
-- realestate rows -- including the ones that equal the documented default --
-- so the row is self-describing, so a single SELECT audits the whole matrix,
-- and so the migration does not silently depend on FEATURE_DEFAULTS being
-- right. arora-k-associates is deliberately untouched and keeps '{}': none of
-- these flags applies to the cafirm vertical.
--
-- Predicated on explicit slugs, NOT on `vertical` as CD-01's backfill was.
-- CD-01 could say "every realestate tenant renders premium-v2"; there is no
-- equivalent true statement here -- the flags differ per client, which is the
-- whole point. A realestate row created after this migration correctly gets
-- '{}', i.e. the documented defaults, which is the right answer for a new
-- client.
UPDATE "clients" SET "features" = '{"propertyMap":false,"propertyManagementSection":true,"propertyManagementPage":true,"vastuSectors":true,"homeLoan":true}'::jsonb
  WHERE "slug" = 'high-properties';--> statement-breakpoint
UPDATE "clients" SET "features" = '{"propertyMap":true,"propertyManagementSection":false,"propertyManagementPage":false,"vastuSectors":false,"homeLoan":false}'::jsonb
  WHERE "slug" IN ('evergreen-real-estate', 'expert-realtors');--> statement-breakpoint
UPDATE "clients" SET "features" = '{"propertyMap":true,"propertyManagementSection":false,"propertyManagementPage":false,"vastuSectors":false,"homeLoan":true}'::jsonb
  WHERE "slug" IN ('nayra-realtors', 'urban-flat-real-estate');
