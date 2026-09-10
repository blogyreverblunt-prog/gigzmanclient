# CD-01 — Manager Analysis

**Status: NOT READY for architecture.** A blocking environment defect makes the
increment's primary acceptance criterion unmeasurable. Escalated to the user.

## Summary

Move the client → template assignment out of `CLIENT_SLUG_TEMPLATE_MAP` in
`lib/templates/index.ts` onto a `clients.template_key` column, enforce
`clients.isActive` in tenant resolution, and reconcile the `lib/domains.ts`
comment with reality. No rendered output may change.

## Affected tenants and vertical

All six. Five real-estate tenants take `template_key = "premium-v2"`;
`arora-k-associates` (cafirm, `is_demo: true`) keeps `null`.

Verified against the database, not assumed:

| slug | vertical | is_active | is_demo | custom_domain |
|---|---|---|---|---|
| high-properties | realestate | true | false | **null** |
| evergreen-real-estate | realestate | true | false | null |
| expert-realtors | realestate | true | false | null |
| nayra-realtors | realestate | true | false | null |
| urban-flat-real-estate | realestate | true | false | null |
| arora-k-associates | cafirm | true | **true** | null |

## Global or per-client gated

**Global.** This is tenant-resolution infrastructure. Every tenant's rendering
path changes; none of their output may. That asymmetry is the whole risk profile
of this increment.

## Expected outcome

No user-visible change. Structurally: a new `clients` row with a valid
`template_key` produces a working site with no code edit.

## Current implementation

- `lib/templates/index.ts:38` — `CLIENT_SLUG_TEMPLATE_MAP`, five hardcoded slugs.
- `lib/tenant.ts:51` — `getTenantBySlug()` returns `null` for a `realestate` row
  absent from that map. A client not listed **404s**; it does not degrade.
- `lib/tenant.ts:93` — `getTenant()` compares the URL's template segment against
  the map.
- `getTenantPath()` / `basePathFor()` are **synchronous** and build every
  internal link.
- `clients.isActive` is honoured in `app/lookup-actions.ts:24` and
  `activeTenants()` (`lib/static-params.ts`), but **not** in `getTenantBySlug()`.

## Blast radius — measured, not estimated

`getTemplateKeyForSlug` is referenced in **34 files**. The task file estimated
~20; that estimate was low and the architect must work from the real list.

Call sites needing individual attention rather than mechanical substitution:

| Site | Why it differs |
|---|---|
| `app/site/[tenant]/(public)/properties/loading.tsx:8` | Gets its tenant from `getTenant()` — i.e. `headers()` — inside a `(public)` route. Pre-existing; **do not fix here** (scope), but the architect must confirm the substitution does not make it worse. |
| `app/site/[tenant]/(public)/layout.tsx:100,109` | Two calls; one emits the `data-template` DOM attribute that Tailwind's per-template palette keys off (`app/globals.css`). A wrong value here silently restyles a whole tenant. |
| `app/site/[tenant]/dashboard/layout.tsx:29` | Same `data-template` attribute on the dashboard tree. |
| `lib/sitemap.ts:264` | Operates on a `client` row already in hand. |
| `lib/tenant.ts:51,93` | The resolution guards themselves — must keep 404ing a realestate row with no template. |

The remaining ~29 are `notFound()` / branch gates in `(public)` pages that already
hold the tenant row, and are mechanical.

## Database impact

One nullable column plus a backfill. Safe against live rows. `pnpm db:generate`
produces migration `0006_*`; the last applied is `0005_black_the_hand.sql`.

## Caching and revalidation impact

`lookupClientBySlug` is `unstable_cache(..., { revalidate: 300 })`. A row edited
directly in the database is invisible for up to five minutes. This affects
**evidence gathering**, not correctness, and must not be filed as a defect.

## Second finding — `customDomain` drift (in scope, item 5)

`lib/domains.ts` maps `highproperties.in` → `high-properties` and its comment
states `clients.customDomain` is "still the source of truth for the sitemap's
absolute URLs — keep the two in step when adding a client domain here."

**They are not in step.** `custom_domain` is `null` for all six rows, including
`high-properties`. The sitemap is therefore not emitting that client's own domain
in its absolute URLs. Whether that is a live SEO defect depends on how
`lib/sitemap.ts` falls back — the architect must determine this and say so.
CD-01 item 5 only requires reconciling the *comment*; if the data is also wrong,
that is a finding to report, not to silently fix here.

## Risks and conflicts

1. **A wrong `data-template` value restyles an entire tenant** with no error.
   Highest-severity failure mode in this increment.
2. **A dropped `generateStaticParams` gate** (`builders/[slug]`,
   `sectors/[sector]`) prerenders nothing while the build still reports success.
3. **Blast radius is the whole deployment** — 34 files, all six tenants.

## BLOCKER — the build does not complete on this machine

The stated baseline ("`pnpm build` is green") is **false in this environment**.
Verified, not assumed:

```
Generating static pages using 15 workers (0/9659) ...
Error: Failed query: ... [cause]: i: sorry, too many clients already
  severity: FATAL, code: 53300
Export encountered an error on /site/[tenant]/(public)/properties/[slug]/page
⨯ Next.js build worker exited with code: 1
```

Mechanism, confirmed against the database:

| Fact | Value |
|---|---|
| Database | `localhost:5432/gigzman_client_sites` |
| `max_connections` | 100 |
| `superuser_reserved_connections` | 3 → **97 usable** |
| Build workers | 15 |
| Pool `max` per worker | 10 (`lib/db/index.ts`, because `NODE_ENV === "production"` during build) |
| Worst case | 15 × 10 = **150 connections** against 97 |

This is deterministic, not flaky, and pre-existing — no one's change caused it.
The TypeScript phase *does* pass ("Finished TypeScript in 15.1s"), so the
typecheck half of `pnpm build` still works; the static-export half dies.

### Why this blocks CD-01 specifically

CD-01 is an infrastructure change across 34 files whose entire regression
argument is "the same pages still prerender". Its AC 4 and most of its Evidence
Required section depend on before/after prerendered route counts. Without a
completing build there is **no baseline**, and the increment's principal safety
check does not exist. Sending an architect and a coder into that produces work
nobody can verify.

### Options

| | Option | Effect |
|---|---|---|
| **A** | Cap the pool during the build phase — `max: 2–3` when `process.env.NEXT_PHASE === "phase-production-build"` in `lib/db/index.ts` (15 × 3 = 45 < 97) | ~5 lines; fixes it for every machine and every later CD increment; keeps `max: 10` for production runtime, which is deliberate for serverless |
| **B** | Raise local `max_connections` to ~300 | No code change; unblocks this machine only; repo stays unbuildable on a default Postgres |
| **C** | Narrow the baseline with `TENANT_ONLY` (already supported in `lib/static-params.ts`) | Reduces pages but not pool size per worker; peak connections still unbounded; changes what is being measured |
| **D** | Proceed with no build evidence | Discards the primary regression signal for a 34-file infrastructure change. Not recommended. |

Recommendation: **A**, as its own small increment before CD-01, because a fresh
clone plus a default Postgres cannot build this repo today — that is a real
defect independent of CD-01, and every later CD increment needs the same
evidence.

## Acceptance criteria

The nine ACs in `task.md` stand unchanged. AC 4 is currently unmeasurable.

## Verdict

**NOT READY.** Blocked pending a user decision on the build environment. Analysis
is otherwise complete; the architect can start immediately once the build
completes end to end and a real baseline exists.
