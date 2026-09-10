# CD-01 — Tenant registry moves from code to the database

## Work Item

A client's template assignment lives in a hardcoded object in source. Until it
lives on the `clients` row, no client can be created without a code edit, so no
dashboard can create one. Move the assignment to the database, and make the
`isActive` flag actually mean something.

## Affected Tenants

All six. Five real-estate tenants (`high-properties`, `evergreen-real-estate`,
`nayra-realtors`, `urban-flat-real-estate`, `expert-realtors`) get a
`template_key` of `premium-v2`; `arora-k-associates` (cafirm) keeps `null`.

## Vertical

Both. The change is in tenant resolution, which is vertical-agnostic.

## Global or Per-Client Gated

**Global.** This is infrastructure — it changes how every tenant resolves. No
tenant's rendered output may change. That is the primary regression bar.

## Expected User-Visible Outcome

Nothing visible. Every page of every tenant renders exactly as it does today.
The outcome is structural: a new `clients` row with a valid `template_key`
produces a working site with no code change.

## Current State

- `lib/templates/index.ts:38` — `CLIENT_SLUG_TEMPLATE_MAP`, a hardcoded
  slug → template object.
- `lib/tenant.ts` `getTenantBySlug()` returns `null` for a `realestate` row with
  no entry in that map. A client absent from it does not render untemplated — it
  **404s**.
- `getTemplateKeyForSlug()` is called from ~20 public page files as a
  `notFound()` gate, and from `getTenantPath()` / `basePathFor()`, which are
  **synchronous** and build every internal link.
- `clients.isActive` is checked in `app/lookup-actions.ts:24` and in
  `activeTenants()` (`lib/static-params.ts`), but **not** in `getTenantBySlug()`
  — an inactive tenant's pages still render on demand.
- `lib/domains.ts:17` — `HOST_TENANT_MAP`. Its comment claims `proxy.ts` "cannot
  reach the database" because it is edge middleware; `proxy.ts`'s own comment
  says Next 16 runs it on Node. One of the two is wrong and both are load-bearing
  documentation.

## Required Changes

1. Add `clients.template_key varchar(60)`, nullable. Migration via
   `pnpm db:generate` — do not hand-write SQL. Backfill the five real-estate
   slugs to `premium-v2` in the same migration.
2. Source the template key from the tenant row instead of the map. **Keep the
   accessor synchronous** — every call site already holds the row. Delete
   `CLIENT_SLUG_TEMPLATE_MAP`; keep `TEMPLATE_REGISTRY` in code, because it is
   the catalogue of templates that exist and `proxy.ts` needs
   `isTemplateUrlSlug()` to stay DB-free.
3. Update `getTenantPath()` / `basePathFor()` to take the row or the template
   key rather than looking it up by slug.
4. Enforce `isActive` in `getTenantBySlug()`: an inactive tenant 404s. Confirm it
   is also absent from the sitemap.
5. Reconcile the `lib/domains.ts` comment with reality: state that
   `clients.customDomain` is the source of truth and that `HOST_TENANT_MAP` is a
   per-deployment convenience backed by `PRIMARY_TENANT_SLUG`. Do **not** add a
   database read to `proxy.ts`.
6. Rewrite — do not delete — the comment in `lib/templates/index.ts` that
   currently justifies the slug-keyed map ("deliberately slug-keyed rather than a
   `clients.templateKey` DB column"). It is now wrong. Record why it changed.

## Acceptance Criteria

1. `clients.template_key` exists, is nullable, and the five real-estate tenants
   carry `premium-v2` after migration.
2. `CLIENT_SLUG_TEMPLATE_MAP` no longer exists anywhere in the repo.
3. The template accessor is synchronous. No call site became `async`. No
   `"use client"` component performs a lookup.
4. `pnpm build` is green and the prerendered route count for each tenant matches
   the pre-change baseline. Record both numbers.
5. Every tenant's home page, `/properties`, `/services` and `/contact` return the
   same status code and the same rendered template as before the change.
6. A `realestate` row with `template_key = null` 404s rather than rendering under
   another client's chrome.
7. Setting `is_active = false` on a tenant makes its pages 404 and removes it
   from the sitemap. Setting it back restores both.
8. `proxy.ts` still has no database import. Verified by reading its imports.
9. Both rewritten comments (`lib/templates/index.ts`, `lib/domains.ts`) state the
   current reasoning and contradict nothing in the code.

## Evidence Required

- **Build:** `pnpm build` before and after, with the prerendered-route summary
  for both. A drop in prerendered pages is a failure, not a detail.
- **Database:** the `clients` rows with `slug`, `vertical`, `template_key`,
  `is_active` after migration.
- **Rendered pages:** status code plus the identifying element rendered, for at
  least `high-properties` (rich real-estate) and `arora-k-associates` (cafirm),
  across the four routes in AC 5.
- **Negative cases:** a wrong template segment redirects to `/`;
  `/cafirm/<realestate-slug>` 404s; a direct `/site/<slug>` request redirects
  to `/`.
- **isActive:** the AC 7 cycle, executed and recorded.

## Non-Goals

- Any dashboard UI. That is CD-03.
- Feature flags. That is CD-02.
- A second template. `TEMPLATE_REGISTRY` should make it a data change later; do
  not build one now.
- Changing anything about how `customDomain` is edited.

## Constraints

- Migration must be safe against live rows: new column nullable, backfilled in
  the same migration.
- `lookupClientBySlug` is `unstable_cache(..., { revalidate: 300 })`. A row
  edited directly in the database is invisible for up to five minutes — account
  for it when gathering evidence, and do not file it as a bug.
- The Postgres client is cached on `globalThis`; after a migration the dev server
  needs a full restart, not a hot reload.

## Reference

`docs/client-dashboard-brief.md` §2 (0A, 0B, 0D) and §11.

---

## Manager correction (added after architecture review)

Two errors in this task file, found by the architect while reading the code.
The architecture plan is correct where it diverges from the text above.

1. **Evidence, "Negative cases": `/cafirm/<realestate-slug>` 404s — WRONG.**
   Public pages resolve through `getTenantBySlug(params.tenant)`, which has no
   URL vertical to compare against; only the header-based `getTenant()` performs
   that check. That path may well return **200** today. The correct bar is
   **before/after equality**, not an absolute 404. If it is 200, that is a
   pre-existing duplicate-URL observation for a later increment — record it, do
   not fix it here.

2. **"~20 page files" — LOW.** The real figure is **34 files / 37 call sites**,
   and two of them (`builders/[slug]/page.tsx:29`,
   `sectors/[sector]/page.tsx:30`) sit inside `generateStaticParams` where only
   `{ id, slug }` is in scope. Those two are the increment's silent-failure
   risk, not its bulk.

Also in scope by manager ruling, beyond items 1–6 above: `clients/*/profile.yaml`
gains a `template:` key, `scripts/seed-client.ts` writes it to
`clients.template_key`, and `AGENTS.md` + `README.md` have their "Adding a
tenant" instructions corrected. Rationale in the plan's `## Manager Approval`.
