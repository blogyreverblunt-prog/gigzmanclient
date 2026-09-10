# CD-02 — Per-client feature flags move to the database

## Work Item

Five per-client feature gates live as hardcoded `Set<string>` allowlists in four
source files. Move them onto the `clients` row so a dashboard can toggle them,
**without turning any call site async** — several are synchronous and one is a
Client Component.

## Affected Tenants

All five real-estate tenants. `arora-k-associates` (cafirm) is unaffected: none
of these flags apply to its vertical, and its `features` value stays `{}`.

## Vertical

`realestate` / `premium-v2` only.

## Global or Per-Client Gated

**Per-client gated by definition** — this work item *is* the gating mechanism.
The refactor itself is global: it touches the shared template's components, so a
mistake reaches all five real-estate clients at once.

## Expected User-Visible Outcome

Nothing visible. Every tenant renders exactly the sections it renders today. The
outcome is that those five gates become row data instead of source code.

## Current State

Four files hold the allowlists:

| Flag | File | Currently enabled for |
|---|---|---|
| Property map section | `lib/premium-v2/home-sections.ts` | all **except** `high-properties` (opt-out) |
| Property-management section | `lib/premium-v2/home-sections.ts` | `high-properties` only |
| Property-management page | `lib/premium-v2/home-sections.ts` | `high-properties` only |
| Vastu sectors | `lib/vastu/enabled.ts` | `high-properties` only |
| Home-loan pages | `lib/home-loan/enabled.ts` | `high-properties`, `nayra-realtors`, `urban-flat-real-estate` |

**The constraint that dictates the design** — these helpers are called from
synchronous and client-component contexts:

- `components/realestate/premium-v2/FooterV2.tsx` is `"use client"` and calls
  `homeLoanEnabled(clientSlug)` during render.
- `components/realestate/templates/PremiumV2Home.tsx` calls two of them inline
  in JSX.
- `lib/premium-v2/tools.ts` and `lib/sitemap.ts` call them synchronously.
- `home-loan/[slug]`, `home-loan/[slug]/[amount]`, `vastu/gurugram/[sector]` and
  `vastu/gurugram/[sector]/[aspect]` call them inside `generateStaticParams()`.

Making these helpers `async` breaks the build. The flags must be a synchronous
read off an object that is already loaded.

## Required Changes

1. Add `clients.features jsonb not null default '{}'`, typed:

   ```ts
   type ClientFeatures = {
     propertyMap?: boolean;
     propertyManagementSection?: boolean;
     propertyManagementPage?: boolean;
     vastuSectors?: boolean;
     homeLoan?: boolean;
   };
   ```

2. Backfill from the table above **exactly**. Note that `propertyMap` is
   currently opt-*out*: four tenants are `true`, `high-properties` is `false`.
   Preserve that, do not normalise it into an allowlist and change behaviour.
3. Keep every helper's name and **synchronous signature**; change the parameter
   from `clientSlug: string` to the tenant row (or a resolved `ClientFeatures`).
4. `FooterV2` and any other `"use client"` consumer receives the flag as a
   **prop** from its server parent. No lookup crosses that boundary.
5. Preserve each existing comment's reasoning — the property-management art is
   High-Properties-branded; the map section is a non-functional placeholder
   pending a real Maps integration; the home-loan pages assert a DSA
   relationship; the vastu matrix is capped for build-output reasons. Rewrite
   them to describe the new mechanism, keeping the *why*. These become the
   dashboard's helper text in CD-03.
6. Add a single accessor (e.g. `featureEnabled(tenant, "homeLoan")`) with the
   documented default for each flag when the key is absent, so an
   empty `{}` on a newly created tenant is well-defined rather than accidental.

## Acceptance Criteria

1. `clients.features` exists as jsonb, non-null, defaulting to `{}`, backfilled
   to reproduce the current behaviour of all five tenants exactly.
2. No helper became `async`. No call site gained an `await`. `FooterV2` receives
   its flag as a prop and performs no lookup.
3. `pnpm build` is green, and the prerendered route counts per tenant match the
   pre-change baseline — in particular `high-properties`'s vastu sector routes
   (~3,700) and the three home-loan tenants' route families.
4. Home page section composition is unchanged for all five tenants: the map
   section absent only on `high-properties`; the property-management section
   present only on `high-properties`.
5. `/property-management` returns 200 on `high-properties` and 404 on the other
   four.
6. `/home-loan` returns 200 on `high-properties`, `nayra-realtors` and
   `urban-flat-real-estate`, and 404 on `evergreen-real-estate` and
   `expert-realtors`.
7. `/vastu/gurugram` returns 200 on `high-properties` and 404 elsewhere. The base
   `/vastu` pages remain available to all five.
8. Sitemap output per tenant is unchanged — **sorted URL-set identity**, not
   byte identity. See the manager correction below.
9. The footer's "Home Loans" link appears on exactly the three home-loan tenants.
10. Toggling a flag in the database changes the rendered output within the cache
    window, without a code change.

## Evidence Required

- **Build:** before/after prerendered route counts, per tenant, per affected
  route family. This is the criterion most likely to regress silently — a broken
  `generateStaticParams` still reports build success.
- **Database:** the `features` value of all six rows after migration.
- **Rendered pages:** status codes for `/property-management`, `/home-loan`,
  `/vastu/gurugram` across all five real-estate tenants — the full matrix, not a
  sample.
- **Home page composition:** for `high-properties` and one other tenant, which
  sections rendered.
- **Sitemap:** URL counts per tenant, before and after.
- **Toggle proof:** flip one flag in the database, show the rendered result
  change, flip it back.

## Non-Goals

- Any dashboard UI or Server Action for editing these. That is CD-03 — including
  the vastu hard cap and the DSA confirmation, which are UI/action concerns.
- Changing which tenant has which flag. Behaviour is frozen; only the mechanism
  moves.
- Adding new flags.

## Constraints

- **Do not enable `vastuSectors` for a fourth tenant, even to test.** It
  prerenders ~3,700 routes per tenant; at three tenants the production build took
  32 minutes, and a fourth blew the deployment output limit and failed the deploy
  after 41 minutes. Test the mechanism with a cheaper flag.
- A shared `premium-v2` component edited for one client reaches all five. State
  the blast radius of every component touched.
- `unstable_cache` on the client lookup is 300s; a flag flip is invisible until
  it expires or is revalidated. CD-03 adds the revalidation — here, just account
  for it in evidence gathering.

## Reference

`docs/client-dashboard-brief.md` §2 (0C) and §11.

---

## Manager correction (added after architecture review)

1. **AC 8's "byte-identical" was wrong — amended above to sorted URL-set
   identity.** `sitemapClients()` has no `ORDER BY`, so it returns physical heap
   order, and this migration writes to every real-estate row — a reshuffle is
   guaranteed. A reordered sitemap file is **not** a regression. Compare sorted
   `<loc>` sets per family. (CD-01 standing finding NB-2.)

2. **The call-site file count in the "Current State" table is incomplete.** 22
   flag-helper sites is correct, but `toolHrefsFor` — which wraps `toolLinksFor`
   and takes the same first parameter — is also called at
   `PremiumV2CalculatorsIndexPage.tsx:23`, `PremiumV2EmiCalculatorPage.tsx:28`
   and `PremiumV2Home.tsx:178`. **The increment touches 16 files, not 13.** The
   architecture plan's table is authoritative.

3. **A hazard the task body does not mention.** `clients/*/profile.yaml` already
   has a top-level `features:` key holding the *firm-settings* booleans
   (`reviews`, `pricing`, `awards`, `client_logos`, `team`), read at
   `scripts/seed-client.ts:109`. It is **not** related to `clients.features`.
   Wiring `profile.features` into the `clients` upsert would write the wrong
   object, silently reverting every tenant to defaults while leaving the column
   looking populated. The plan rules the seed write out of scope and requires a
   local rename plus a comment so the mistake cannot be made by autocomplete.
