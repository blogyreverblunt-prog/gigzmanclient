# CD-06 — SEO without an SEO form: generated metadata and a readiness panel

## Work Item

A non-technical operator cannot write metadata for 39 page types and thousands of
generated pages. So do not ask them to. Generate the homepage metadata from data
they have already entered, keep every other page family generated in code, expose
exactly two paste-once technical fields, and replace the rest of what would have
been an SEO form with a readiness checklist.

## Affected Tenants

All six read the generated homepage metadata. Changing the generation changes
every tenant's title and description, so this is a live-SEO change, not a
dashboard-only one.

## Vertical

Both, with a different generation pattern per vertical.

## Global or Per-Client Gated

**Global** for the generation logic. Per-client only through the override
columns, which already exist.

## Expected User-Visible Outcome

Two things:

1. In the client form: a small SEO section with `ga4MeasurementId` and
   `searchConsoleVerification`, a live Google-result preview of the generated
   title and description with character counts, and one collapsed "Write these
   myself" override.
2. A **Site readiness** panel listing what is still missing before the site can
   be handed to the client, each row linking to the field that fixes it.

## Current State

- `firm_settings` already has `seo_title`, `seo_description`,
  `ga4_measurement_id`, `search_console_verification`. `seo_title` /
  `seo_description` are currently seeded from `profile.yaml` and used directly.
- Every other page family already generates its own metadata in code —
  properties, localities, sectors, vastu, home-loan, services, updates. Only
  `professional_updates` carries its own `seoTitle` / `seoDescription`.
- `scripts/check-content.ts` already implements the pre-delivery checklist:
  `_status` placeholder/pending reporting, plus the thin-content and duplicate
  checks on locality descriptions that catch doorway pages. It reads YAML from
  `clients/`, so a dashboard-created client currently produces no report (CD-09
  addresses that).
- `lib/sitemap.ts` builds per-tenant sitemaps and reads `clients.customDomain`
  for absolute URLs.

## Required Changes

1. **Generate homepage title and description** from fields already captured —
   firm name, business category, locality, region, established year, and the
   client's top services or property types — using a per-vertical pattern held in
   code (`lib/verticals/` or `lib/premium-v2/`, per the module boundaries, not
   inside a component).
2. **`seo_title` / `seo_description` become overrides.** `null` means "use the
   generated one". **Never write the generated text into those columns** — doing
   so freezes it and it stops tracking later edits. Existing non-null values seeded
   from YAML are preserved as overrides.
3. **Live preview.** A Google-result mock with character counts and a
   traffic-light length indicator, updating as the underlying fields change.
4. **One override control**, collapsed by default, prefilled with the generated
   text when opened, with a clear way back to generated.
5. **Readiness panel.** Reuse `check-content.ts`'s logic — do not duplicate it;
   extract it into something both can call. Rows: logo present, favicon set
   present, OG image present, NAP complete, opening hours set, GA4 set, Search
   Console verified, localities with unique descriptions at or above the minimum
   length, sitemap URL count, robots status, custom domain set, and the count of
   fields still `placeholder` or `pending`.
6. **Do not add per-page SEO fields** to any content screen beyond the two
   `professional_updates` already has, and keep those collapsed by default.

## Acceptance Criteria

1. A client with `seo_title = null` renders a generated title and description
   that includes its firm name and locality, and differs meaningfully between two
   different clients of the same vertical.
2. A client with a non-null `seo_title` renders that value verbatim. The six
   existing tenants' current titles and descriptions are unchanged by this work
   — confirmed per tenant.
3. The generated text is never persisted into the override columns. Proven by
   loading the form, saving without touching the override, and showing the
   columns still `null`.
4. Clearing an override returns the page to generated metadata.
5. The two technical fields save and appear in the rendered page — GA4 wired
   through the existing analytics component, Search Console as the verification
   meta tag.
6. The readiness panel reports correctly for `high-properties` (rich content),
   `arora-k-associates` (cafirm), and a client with deliberately missing fields.
   Its placeholder/pending counts agree with `pnpm check:content <slug>` for the
   same client.
7. Character counts and the length indicator match the rendered output.
8. `pnpm build` green; no public route became dynamic; prerendered counts
   unchanged; sitemap URL counts per tenant unchanged.

## Evidence Required

- **AC 2 is the critical one:** the current `<title>` and meta description of all
  six tenants before and after. Any unintended change is a live-SEO regression.
- Generated metadata for two clients of the same vertical, shown side by side.
- AC 3 executed: form loaded, saved, columns shown still `null`.
- The readiness panel output for the three clients in AC 6, beside the
  `pnpm check:content` output for the same clients.
- GA4 and Search Console values present in the rendered HTML.
- `pnpm build` with the prerender summary and per-tenant sitemap counts.

## Non-Goals

- Per-page metadata editing for properties, localities, sectors, vastu,
  home-loan or services. They are generated and stay generated.
- Keyword tooling, rank tracking, content scoring, or any third-party SEO API.
- Changing the thin-content or duplicate-description rules. Reuse them as they
  are.
- Rewriting the sitemap or robots implementation.

## Constraints

- The readiness panel must **reuse** `check-content.ts`'s logic, not reimplement
  it. Two implementations of the same rule will disagree, and the one the
  operator sees will be the wrong one.
- Nothing here may push a public route into dynamic rendering — metadata
  generation runs on prerendered pages.
- `unstable_cache` keys must include every argument that varies the result. A
  metadata cache keyed without the tenant serves one client's title on another's
  site.
- Do not invent content to fill a generated description. If the inputs are
  missing, the generated text must degrade gracefully, and the readiness panel
  must say what is missing.

## Reference

`docs/client-dashboard-brief.md` §6, §9, §11.
