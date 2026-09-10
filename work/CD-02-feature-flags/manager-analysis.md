# CD-02 — Manager Analysis

**Status: READY for architecture.**

## Summary

Five per-client feature gates live as hardcoded `Set<string>` allowlists in four
source files. Move them onto `clients.features` (jsonb) so a dashboard can toggle
them — **without turning any call site async**, because several are synchronous
and one is a Client Component.

## Affected tenants and vertical

The five `realestate` tenants. `arora-k-associates` (cafirm) is unaffected and
its `features` stays `{}` — none of these flags apply to its vertical.

Current state, read from the four files (this is the behaviour the migration
must reproduce **exactly**):

| Flag | high-properties | evergreen | expert | nayra | urban-flat |
|---|---|---|---|---|---|
| `propertyMap` | **false** | true | true | true | true |
| `propertyManagementSection` | true | false | false | false | false |
| `propertyManagementPage` | true | false | false | false | false |
| `vastuSectors` | true | false | false | false | false |
| `homeLoan` | true | false | false | **true** | **true** |

Note `propertyMap` is opt-**out** — four tenants are `true`. Normalising it into
an allowlist would silently change four sites.

## Global or per-client gated

**Per-client gated by definition** — this work item *is* the gating mechanism.
The refactor itself is global: it edits the shared `premium-v2` template, so a
mistake reaches all five real-estate clients at once.

## Expected outcome

Nothing user-visible. Every tenant renders exactly the sections it renders today.
The gates become row data instead of source code.

## Current implementation — 22 call sites across 13 files

| File | Sites | Note |
|---|---|---|
| `lib/sitemap.ts` | 4 | operates on a `client` row already in hand |
| `components/realestate/premium-v2/FooterV2.tsx` | 1 | **`"use client"`** — see below |
| `components/realestate/templates/PremiumV2Home.tsx` | 2 | Server Component, holds `tenant` |
| `lib/premium-v2/tools.ts` | 1 | `toolLinksFor(clientSlug)`; sole caller is `(public)/layout.tsx:147`, a Server Component |
| `(public)/home-loan/[slug]/page.tsx` | 2 | **one inside `generateStaticParams`** |
| `(public)/home-loan/[slug]/[amount]/page.tsx` | 2 | **one inside `generateStaticParams`** |
| `(public)/home-loan/page.tsx` | 1 | |
| `(public)/calculators/[key]/page.tsx` | 1 | |
| `(public)/property-management/page.tsx` | 2 | |
| `(public)/vastu/page.tsx` | 1 | |
| `(public)/vastu/gurugram/page.tsx` | 1 | |
| `(public)/vastu/gurugram/[sector]/page.tsx` | 2 | gSP gate **re-resolves** via `getTenantBySlug` |
| `(public)/vastu/gurugram/[sector]/[aspect]/page.tsx` | 2 | gSP gate **re-resolves** via `getTenantBySlug` |

## Risk 1 — the CD-01 trap recurs, in a different place

`home-loan/[slug]/page.tsx:29` and `home-loan/[slug]/[amount]/page.tsx:16` gate
inside `generateStaticParams` on `tenant.slug`, where `tenant` is the object
`paramsForEachTenant` supplies. After CD-01 that object is:

```ts
export type StaticParamTenant = { id: string; slug: string; vertical: string; templateKey: string | null };
```

**It does not carry `features`.** A mechanical substitution to
`tenant.features.homeLoan` yields `undefined` → `return []` → the home-loan route
families prerender **zero pages while `pnpm build` reports success**. This is
exactly the failure mode CD-01 hit, in its second location, and the fix is the
same shape: widen `StaticParamTenant` **before** editing those two gates, so they
fail to typecheck rather than fail silently.

The **vastu** gSP gates are safe by contrast — they already re-resolve with
`await getTenantBySlug(tenant.slug)` and so hold the full row. The architect must
state this asymmetry explicitly so the coder does not "harmonise" the two shapes.

## Risk 2 — the Client Component boundary

`FooterV2.tsx` is `"use client"` and calls `homeLoanEnabled(clientSlug)` during
render; `(public)/layout.tsx:197` passes it `clientSlug={tenant.slug}`. An async
or row-reading accessor cannot cross that boundary. The flag must arrive as a
**prop** computed on the server.

`toolLinksFor` is *not* a client-boundary problem — its only caller is the
Server Component layout — but it takes `clientSlug` and must change shape too.

## Risk 3 — vastu is a deploy-limit toggle, not a preference

`lib/vastu/enabled.ts` documents that the matrix is ~3,700 prerendered routes per
tenant; at three tenants the production build took 32 minutes, and a fourth blew
the deployment output limit and failed the deploy after 41 minutes. CD-01's
verified build shows `high-properties` at 5,005 prerendered pages against ~1,071
for the next largest — that gap *is* the vastu matrix.

**Do not enable `vastuSectors` for a second tenant, even to test.** The hard cap
and its UI belong to CD-03; this increment freezes behaviour and only moves the
mechanism.

## Database impact

One column: `clients.features jsonb not null default '{}'`. Nullable-free but
defaulted, so safe against live rows. Backfill in the same migration, reproducing
the table above exactly. Next migration is `0007` (`0006` is CD-01's).

## Caching and revalidation impact

`lookupClientBySlug` is `unstable_cache(..., { revalidate: 300 })` and already
does `db.select()` (all columns), so `features` arrives automatically with no key
change. A flag flipped directly in SQL is invisible for up to 300s, compounding
with the layout's `revalidate = 300` to ~10 minutes — the same window CD-01
documented. This increment **documents** it; CD-03 adds revalidation. Evidence
gathering must use the `rm -rf .next` + restart discipline rather than racing it.

## Dependencies

CD-01 (complete, VERIFY_PASS) — `StaticParamTenant` exists to be widened, and
`clients` already carries one CD-01 column. No new packages.

## Baseline

CD-01's verifier build, on the current tree, unchanged since:

```
arora-k-associates 42 · evergreen-real-estate 546 · expert-realtors 547
high-properties 5005 · nayra-realtors 1071 · urban-flat-real-estate 1071
```

**Tree-state caveat:** CD-00 and CD-01 are still uncommitted, so `git diff` alone
no longer isolates this increment. `work/CD-02-feature-flags/pre-state.txt` holds
the 55-entry `git status --porcelain` snapshot taken before CD-02 began; anything
not in it is CD-02's. Committing first would be cleaner and remains recommended.

## Risks and conflicts

1. **Silent zero-prerender on the home-loan families** (Risk 1). Highest severity.
2. **A shared `premium-v2` component edited for one client reaches all five** —
   `FooterV2` and `PremiumV2Home` are both shared.
3. **`propertyMap` opt-out inversion** — getting the polarity backwards silently
   changes four sites, and the home page still renders, so nothing fails loudly.
4. Sitemap output must stay byte-identical per family; note CD-01's standing
   finding that `sitemapClients()` has no `ORDER BY`, so compare **sets**, not
   file order.

## Acceptance criteria

The ten ACs in `task.md` stand unchanged and are all measurable.

## Verdict

**READY.** No blocking questions. The architect should pay particular attention
to `StaticParamTenant`'s second widening and to how the flags reach `FooterV2`.
