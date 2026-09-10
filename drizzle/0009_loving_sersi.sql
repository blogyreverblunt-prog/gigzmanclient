ALTER TABLE "clients" ADD COLUMN "hero_copy" jsonb;
--> statement-breakpoint
-- CD-07 backfill. Only evergreen-real-estate had custom hero copy (BY_CLIENT
-- in lib/premium-v2/positioning.ts); every other client rendered DEFAULT and
-- keeps NULL, which still resolves to DEFAULT. Backfilling all five with the
-- default would have been a lie about which of them anyone had chosen copy for.
UPDATE "clients" SET "hero_copy" = '{"eyebrow":"Sohna & the Gurugram farm belt","headline":["Land of your own,","an hour from the city."],"blurb":"{firm} works only on farm houses, weekend estates and agricultural land along the Sohna–Gurugram corridor — with plot sizes, ownership and asking prices set out plainly on every listing.","searchPlaceholder":"Your mobile number","stats":[{"kind":"listings","label":"Farm houses listed","icon":"Trees"},{"kind":"corridors","label":"Corridors covered","icon":"Signpost"},{"kind":"medianPlot","label":"Median plot size","icon":"Ruler"},{"kind":"medianPrice","label":"Median asking price","icon":"IndianRupee"}]}'::jsonb
  WHERE "slug" = 'evergreen-real-estate';
