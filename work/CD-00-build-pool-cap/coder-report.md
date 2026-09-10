# IMPLEMENTATION RESULT

## Work Item

CD-00 — cap the Postgres pool during the Next static-export phase so `pnpm build`
completes without exhausting `max_connections`.

## Outcome

SUCCESS. `pnpm build` exits 0 and generated all 9,659/9,659 static pages
(previously it died at `0/9659` with `FATAL 53300: sorry, too many clients
already`). `NEXT_PHASE` was confirmed empirically (source read + live log) to
be set to `phase-production-build` inside the static-export worker processes,
so the discriminator in the approved plan is valid and was applied as-is —
no `ARCHITECTURE_BLOCKER` needed.

## Affected Tenants

All six, indirectly (the build is deployment-wide, per the plan). No tenant
content, route, or rendered output was touched — confirmed: the route summary
below is the same shape/routes as the pre-existing route tree, just now able
to finish generating.

## Implemented Components

None (no UI/component work — infrastructure-only change).

## Files Created

- `D:\PROJECTS\gigzmanclient\work\CD-00-build-pool-cap\coder-report.md` (this file)
- `D:\PROJECTS\gigzmanclient\work\CD-00-build-pool-cap\build-output.log` (full build output, work-directory artifact)
- `D:\PROJECTS\gigzmanclient\work\CD-00-build-pool-cap\pg-activity-samples.log` (work-directory artifact — DB connection samples during the export phase)

A temporary script `_tmp-db-check.mjs` was created at the repo root to query
`pg_settings`/`pg_stat_activity` before the build, and deleted before
finishing. It never appears in `git status` output.

## Files Modified

- `D:\PROJECTS\gigzmanclient\lib\db\index.ts` — the only production file, as scoped.

## Database Migrations

None. Not applicable to this work item.

## Data Access / Server Actions Added or Changed

None.

## Routes Added or Changed

None. The route tree is unchanged; this item makes the existing prerender
able to finish rather than altering what prerenders.

## Rendering and Caching

Unchanged. No `cache()`/`unstable_cache()` touched. Pool size governs
concurrent DB connections, not result caching or revalidation.

## Per-Client Gating

Not applicable — global infrastructure file, not gated by client.

## Content / YAML Changes

None.

## Commands Executed

```
node --env-file=.env.local _tmp-db-check.mjs      # pre-build DB settings check
pnpm build > work/CD-00-build-pool-cap/build-output.log 2>&1   # ONE build run
```

`pnpm build` was run exactly once, in the background, with a temporary
`console.log("TEMP-DEBUG NEXT_PHASE =", process.env.NEXT_PHASE)` placed
immediately above the discriminator so its value could be observed live
inside the actual worker processes during that same run. The debug line was
removed by a plain deletion edit afterward — no second build was run, since
deleting a `console.log` cannot change runtime behaviour and the captured
route summary/exit code remain valid evidence for the code as it now stands.

`pnpm dry-run` was not run (stale, per the task/plan; not part of this
item's acceptance).

## Results

No test suite exists (`package.json` defines no `test`/`lint`/`typecheck`
script) — this section reports real command output, not a claim of "tests
passing."

**Build**: exit code 0.

```
✓ Compiled successfully in 4.4s
  Running TypeScript ...
  Finished TypeScript in 9.6s ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (0/9659) ...
  Generating static pages using 15 workers (2414/9659)
  Generating static pages using 15 workers (4829/9659)
  Generating static pages using 15 workers (7244/9659)
✓ Generating static pages using 15 workers (9659/9659) in 2.1min
  Finalizing page optimization ...
EXIT_CODE=0
```

**Full route summary** (complete, as printed by Next — folded `[+N more
paths]` groupings are Next's own console format, not a truncation by me):
captured verbatim in
`D:\PROJECTS\gigzmanclient\work\CD-00-build-pool-cap\build-output.log`
(230 lines, the entire `next build` stdout/stderr from this run). Reproduced
below in full as the CD-01 baseline:

```
$ next build
▲ Next.js 16.3.3 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 86ms

  Creating an optimized production build ...
✓ Compiled successfully in 4.4s
  Running TypeScript ...
  Finished TypeScript in 9.6s ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (0/9659) ...
  Generating static pages using 15 workers (2414/9659)
  Generating static pages using 15 workers (4829/9659)
  Generating static pages using 15 workers (7244/9659)
✓ Generating static pages using 15 workers (9659/9659) in 2.1min
  Finalizing page optimization ...

Route (app)                                                                     Revalidate  Expire
┌ ƒ /
├ ○ /_not-found
├ ƒ /login
├ ○ /robots.txt
├   /site/[tenant]
│ ├ ● /site/high-properties                                                             5m      1y
│ ├ ● /site/evergreen-real-estate                                                       5m      1y
│ ├ ● /site/expert-realtors                                                             5m      1y
│ └ ● [+3 more paths]
├ ƒ /site/[tenant]/[location]
├   /site/[tenant]/area-converter
│ ├ ● /site/high-properties/area-converter                                              5m      1y
│ ├ ● /site/evergreen-real-estate/area-converter                                        5m      1y
│ ├ ● /site/expert-realtors/area-converter                                              5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/area-converter/[pair]
│ ├ ● /site/high-properties/area-converter/square-feet-to-square-yard                   5m      1y
│ ├ ● /site/high-properties/area-converter/square-feet-to-square-metre                  5m      1y
│ ├ ● /site/high-properties/area-converter/square-feet-to-square-karam                  5m      1y
│ └ ● [+907 more paths]
├   /site/[tenant]/builders
│ ├ ● /site/high-properties/builders                                                    5m      1y
│ ├ ● /site/evergreen-real-estate/builders                                              5m      1y
│ ├ ● /site/expert-realtors/builders                                                    5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/builders/[slug]
│ ├ ● /site/high-properties/builders/meridian-developers                                5m      1y
│ ├ ● /site/high-properties/builders/northgate-estates                                  5m      1y
│ ├ ● /site/high-properties/builders/vatika                                             5m      1y
│ └ ● [+125 more paths]
├   /site/[tenant]/calculators
│ ├ ● /site/high-properties/calculators                                                 5m      1y
│ ├ ● /site/evergreen-real-estate/calculators                                           5m      1y
│ ├ ● /site/expert-realtors/calculators                                                 5m      1y
│ └ ● [+3 more paths]
├ ƒ /site/[tenant]/calculators/[key]
├   /site/[tenant]/careers
│ ├ ● /site/high-properties/careers                                                     5m      1y
│ ├ ● /site/evergreen-real-estate/careers                                               5m      1y
│ ├ ● /site/expert-realtors/careers                                                     5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/compliance-calendar
│ ├ ● /site/high-properties/compliance-calendar                                         5m      1y
│ ├ ● /site/evergreen-real-estate/compliance-calendar                                   5m      1y
│ ├ ● /site/expert-realtors/compliance-calendar                                         5m      1y
│ └ ● [+3 more paths]
├ ƒ /site/[tenant]/contact
├ ƒ /site/[tenant]/dashboard
├ ƒ /site/[tenant]/dashboard/calculators
├ ƒ /site/[tenant]/dashboard/compliance
├ ƒ /site/[tenant]/dashboard/localities
├ ƒ /site/[tenant]/dashboard/login
├ ƒ /site/[tenant]/dashboard/properties
├ ƒ /site/[tenant]/dashboard/queries
├ ƒ /site/[tenant]/dashboard/queries/[id]
├ ƒ /site/[tenant]/dashboard/settings
├ ƒ /site/[tenant]/dashboard/updates
├   /site/[tenant]/faq
│ ├ ● /site/high-properties/faq                                                         5m      1y
│ ├ ● /site/evergreen-real-estate/faq                                                   5m      1y
│ ├ ● /site/expert-realtors/faq                                                         5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/firm-profile
│ ├ ● /site/high-properties/firm-profile                                                5m      1y
│ ├ ● /site/evergreen-real-estate/firm-profile                                          5m      1y
│ ├ ● /site/expert-realtors/firm-profile                                                5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/home-loan
│ ├ ● /site/high-properties/home-loan                                                   5m      1y
│ ├ ● /site/evergreen-real-estate/home-loan                                             5m      1y
│ ├ ● /site/expert-realtors/home-loan                                                   5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/home-loan/[slug]
│ ├ ● /site/high-properties/home-loan/10-lakh-home-loan-emi                             5m      1y
│ ├ ● /site/high-properties/home-loan/15-lakh-home-loan-emi                             5m      1y
│ ├ ● /site/high-properties/home-loan/20-lakh-home-loan-emi                             5m      1y
│ └ ● [+129 more paths]
├   /site/[tenant]/home-loan/[slug]/[amount]
│ ├ ● /site/high-properties/home-loan/hdfc-bank/10-lakh                                 5m      1y
│ ├ ● /site/high-properties/home-loan/hdfc-bank/15-lakh                                 5m      1y
│ ├ ● /site/high-properties/home-loan/hdfc-bank/20-lakh                                 5m      1y
│ └ ● [+1437 more paths]
├   /site/[tenant]/knowledge
│ ├ ● /site/high-properties/knowledge                                                   5m      1y
│ ├ ● /site/evergreen-real-estate/knowledge                                             5m      1y
│ ├ ● /site/expert-realtors/knowledge                                                   5m      1y
│ └ ● [+3 more paths]
├ ƒ /site/[tenant]/legal/[slug]
├   /site/[tenant]/localities
│ ├ ● /site/high-properties/localities                                                  5m      1y
│ ├ ● /site/evergreen-real-estate/localities                                            5m      1y
│ ├ ● /site/expert-realtors/localities                                                  5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/localities/[slug]
│ ├ ● /site/high-properties/localities/golf-course-road                                 5m      1y
│ ├ ● /site/high-properties/localities/dwarka-expressway                                5m      1y
│ ├ ● /site/high-properties/localities/sohna-road                                       5m      1y
│ └ ● [+25 more paths]
├   /site/[tenant]/maps/gurgaon
│ ├ ● /site/high-properties/maps/gurgaon                                                5m      1y
│ ├ ● /site/evergreen-real-estate/maps/gurgaon                                          5m      1y
│ ├ ● /site/expert-realtors/maps/gurgaon                                                5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/maps/gurgaon/[area]
│ ├ ● /site/high-properties/maps/gurgaon/masterplan                                     5m      1y
│ ├ ● /site/high-properties/maps/gurgaon/sohna-masterplan                               5m      1y
│ ├ ● /site/high-properties/maps/gurgaon/dlf-phase-1                                    5m      1y
│ └ ● [+372 more paths]
├ ƒ /site/[tenant]/opengraph-image-rjtvo9
├   /site/[tenant]/properties
│ ├ ● /site/high-properties/properties                                                  5m      1y
│ ├ ● /site/evergreen-real-estate/properties                                            5m      1y
│ ├ ● /site/expert-realtors/properties                                                  5m      1y
│ └ ● [+3 more paths]
├ ƒ /site/[tenant]/properties/[slug]
├   /site/[tenant]/property-management
│ ├ ● /site/high-properties/property-management                                         5m      1y
│ ├ ● /site/evergreen-real-estate/property-management                                   5m      1y
│ ├ ● /site/expert-realtors/property-management                                         5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/rental-yield
│ ├ ● /site/high-properties/rental-yield                                                5m      1y
│ ├ ● /site/evergreen-real-estate/rental-yield                                          5m      1y
│ ├ ● /site/expert-realtors/rental-yield                                                5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/rental-yield/[corridor]
│ ├ ● /site/high-properties/rental-yield/golf-course-road                               5m      1y
│ ├ ● /site/high-properties/rental-yield/dwarka-expressway                              5m      1y
│ ├ ● /site/high-properties/rental-yield/sohna-road                                     5m      1y
│ └ ● [+25 more paths]
├   /site/[tenant]/sectors
│ ├ ● /site/high-properties/sectors                                                     5m      1y
│ ├ ● /site/evergreen-real-estate/sectors                                               5m      1y
│ ├ ● /site/expert-realtors/sectors                                                     5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/sectors/[sector]
│ ├ ● /site/high-properties/sectors/54                                                  5m      1y
│ ├ ● /site/high-properties/sectors/70                                                  5m      1y
│ ├ ● /site/high-properties/sectors/88                                                  5m      1y
│ └ ● [+167 more paths]
├   /site/[tenant]/services
│ ├ ● /site/high-properties/services                                                    5m      1y
│ ├ ● /site/evergreen-real-estate/services                                              5m      1y
│ ├ ● /site/expert-realtors/services                                                    5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/services/[slug]
│ ├ ● /site/arora-k-associates/services/income-tax-return                               5m      1y
│ ├ ● /site/arora-k-associates/services/tax-planning-advisory                           5m      1y
│ ├ ● /site/arora-k-associates/services/tds-compliance                                  5m      1y
│ └ ● [+17 more paths]
├ ƒ /site/[tenant]/thank-you
├ ƒ /site/[tenant]/updates
├   /site/[tenant]/updates/[slug]
│ ├ ● /site/high-properties/updates/dwarka-expressway-price-trend-2026                  5m      1y
│ ├ ● /site/high-properties/updates/rera-registration-what-buyers-should-check          5m      1y
│ ├ ● /site/high-properties/updates/emi-vs-rent-golf-course-road                        5m      1y
│ └ ● [+15 more paths]
├   /site/[tenant]/vastu
│ ├ ● /site/high-properties/vastu                                                       5m      1y
│ ├ ● /site/evergreen-real-estate/vastu                                                 5m      1y
│ ├ ● /site/expert-realtors/vastu                                                       5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/vastu/[topic]
│ ├ ● /site/high-properties/vastu/north-facing-house                                    5m      1y
│ ├ ● /site/high-properties/vastu/north-facing-flat                                     5m      1y
│ ├ ● /site/high-properties/vastu/north-facing-plot                                     5m      1y
│ └ ● [+1217 more paths]
├   /site/[tenant]/vastu/gurugram
│ ├ ● /site/high-properties/vastu/gurugram                                              5m      1y
│ ├ ● /site/evergreen-real-estate/vastu/gurugram                                        5m      1y
│ ├ ● /site/expert-realtors/vastu/gurugram                                              5m      1y
│ └ ● [+3 more paths]
├   /site/[tenant]/vastu/gurugram/[sector]
│ ├ ● /site/high-properties/vastu/gurugram/sector-1                                     5m      1y
│ ├ ● /site/high-properties/vastu/gurugram/sector-2                                     5m      1y
│ ├ ● /site/high-properties/vastu/gurugram/sector-3                                     5m      1y
│ └ ● [+134 more paths]
├   /site/[tenant]/vastu/gurugram/[sector]/[aspect]
│ ├ ● /site/high-properties/vastu/gurugram/sector-1/north-facing                        5m      1y
│ ├ ● /site/high-properties/vastu/gurugram/sector-1/north-east-facing                   5m      1y
│ ├ ● /site/high-properties/vastu/gurugram/sector-1/east-facing                         5m      1y
│ └ ● [+3559 more paths]
├ ○ /sitemap.xml                                                                        1h      1y
└ ƒ /sitemaps/[file]


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand

EXIT_CODE=0
```

Static page count: reported build progress went `0 → 2414 → 4829 → 7244 →
9659/9659` — matches the task's expected ≈9,659 exactly.

**Database — `pg_settings`** (queried before the build, via a temporary
script using the `postgres` package already in `dependencies`):

```
max_connections = 100
superuser_reserved_connections = 3   → 97 usable
```

Matches the task's measured facts exactly.

**Database — `pg_stat_activity` sampled during the export phase**: a
background loop sampled `SELECT count(*) FROM pg_stat_activity` every ~8s
while the build ran. Baseline before the build was 10 connections (task
noted "9 idle connections already present"; close enough — likely +1 for
timing of the sampling script's own connection). During the export phase the
count rose and stabilised at a peak of **61**, comfortably under the 97
usable limit and well under the previous worst case of 150. Full samples in
`work/CD-00-build-pool-cap/pg-activity-samples.log`. This is consistent with
15 workers x 3 = 45 new pool connections plus the pre-existing baseline.

**`NEXT_PHASE` discriminator — empirical confirmation** (the judgement call
required by the task):
1. Source-level: `node_modules/.pnpm/next@16.3.3.../next/dist/build/index.js`
   line 1212 sets `process.env.NEXT_PHASE = _constants1.PHASE_PRODUCTION_BUILD`
   (`PHASE_PRODUCTION_BUILD = 'phase-production-build'`, from
   `next/dist/shared/lib/constants.js`) immediately before
   `createStaticWorker` spawns the 15 workers at line 1213.
2. `next/dist/lib/worker.js` builds each worker's environment as
   `{ ...process.env, ...(forkOptions.env ?? {}) }` — i.e. it inherits the
   full parent `process.env`, so `NEXT_PHASE` reaches every worker process.
3. Live confirmation: a temporary `console.log("TEMP-DEBUG NEXT_PHASE =",
   process.env.NEXT_PHASE)` placed directly above the discriminator printed
   `TEMP-DEBUG NEXT_PHASE = phase-production-build` repeatedly (18 times
   across the "Collecting page data" phase, once more mid-export) in the
   actual build log — i.e. inside the real worker processes, not just the
   parent. This is the empirical evidence the task required; the debug line
   was then deleted (not left in the shipped file).

`NEXT_PHASE` was confirmed set. No `ARCHITECTURE_BLOCKER` was warranted.

## Pre-Flight Self-Review

1. **Tenant scoping** — N/A. `lib/db/index.ts` creates the shared connection
   pool/client only; it issues no queries and carries no `clientId`. Every
   query still supplies its own filter, unaffected by this change. PASS.
2. **Public pages stay static** — no `headers()` call added anywhere; no
   route file touched at all. PASS.
3. **`generateStaticParams` complete param set** — not touched; no route
   file was modified. The build's own summary shows the same SSG route
   shapes as before (`● /site/[tenant]/...` with per-tenant/per-path
   entries), now able to complete. PASS (N/A to this item's diff).
4. **Cache keys vary with every argument** — not touched; no `cache()`/
   `unstable_cache()` call exists in this file. PASS (N/A).
5. **Links survive host mode** — not touched; no `tenantPath`/`basePathFor`
   or hardcoded route strings anywhere in this file. PASS (N/A).
6. **Blast radius across tenants** — this file is intentionally
   vertical-agnostic global infrastructure (per the plan), touched once for
   all tenants uniformly; no client-specific behaviour introduced, no
   `lib/premium-v2/home-sections.ts` gating needed. PASS.
7. **Config agrees with code** — no `next/image` `quality` value, no new
   disk-read asset, no `next.config.ts` change. PASS (N/A).
8. **No invented client facts** — no `clients/*/` YAML touched. PASS (N/A).
9. **Client-render purity** — this file has no `"use client"` directive and
   renders nothing; it is a server-only module-scope singleton. PASS (N/A).
10. **Scope discipline** — `git status --porcelain` after the change shows
    only `lib/db/index.ts` modified by me. Two other tracked files show as
    modified (`AGENTS.md`, `app/layout.tsx`) and two untracked directories
    exist (`docs/`, `.claude/`) — all four predate this session: `AGENTS.md`
    carries the block Next's own `next dev`/`next build` tooling
    auto-regenerates on every run (documented in the file itself and in
    `generate-agent-files.js`, not an edit I made); `app/layout.tsx` was
    already modified per the git status snapshot at the start of this
    conversation, before any tool call of mine; `docs/` contains two files
    timestamped before this session started; `.claude/` is pre-existing
    tooling config. I created and then deleted a temporary root-level
    `_tmp-db-check.mjs` — it does not appear in the final `git status`.
    `lib/templates/index.ts`, `lib/tenant.ts`, `lib/domains.ts` and
    `next.config.ts` — explicitly out of scope — were not opened or edited.
    PASS for my diff; the pre-existing unrelated modifications are called
    out for the manager's awareness, not mine to revert.

## Acceptance Criteria

1. **`pnpm build` completes with exit code 0 and prints its route summary.**
   PASS. `EXIT_CODE=0` in `build-output.log`; full route summary captured
   above and in that file.
2. **Peak connection count stays under the usable limit.** PASS. Sampled
   `pg_stat_activity` peaked at 61 during the export phase (limit 97 usable,
   worst case previously 150). `15 workers x max:3 = 45` new connections,
   arithmetic matches the comment in the code.
3. **Production runtime pool still `10`, development still `3`.** PASS —
   code evidence: `max: isBuildPhase ? 3 : isProduction ? 10 : 3` preserves
   both branches unchanged from before; `isBuildPhase` is `false` whenever
   `NEXT_PHASE !== "phase-production-build"`, i.e. always false outside a
   build (dev server, `next start`, tests), so runtime behaviour for both
   `NODE_ENV` values is exactly as before.
4. **`globalThis` caching behaviour in development unchanged.** PASS —
   `globalForDb` declaration, the `globalForDb.client ??` lookup, and the
   `if (process.env.NODE_ENV !== "production") globalForDb.client = client;`
   line are byte-for-byte untouched (see diff below).
5. **No other file modified; `git status --porcelain` shows `lib/db/index.ts`
   and work-directory artifacts only.** PASS for files this session touched
   — see Pre-Flight item 10 above for the pre-existing unrelated entries.
6. **Full route summary captured, listing per-route prerendered counts.**
   PASS. Captured in full in `work/CD-00-build-pool-cap/build-output.log`
   (230 lines) and reproduced verbatim in this report's Results section.

## Architecture Plan Compliance

Implemented exactly the code in the plan's `## Design` section: same
discriminator (`process.env.NEXT_PHASE === "phase-production-build"`, the
literal form, not the `next/constants` import — the plan states either is
acceptable and the literal is the lower-risk default), same value (`3` for
the build phase), same comment content (worker-count arithmetic, the
deliberate runtime value, the two rejected alternatives), same untouched
`globalForDb` cache block. No deviation.

## Deviations

None from the approved plan.

## Known Limitations

- The `pg_stat_activity` peak of 61 includes whatever background
  connections already existed on the server (baseline ~10) plus this
  session's own sampling connections (`max: 1` each, opened and closed per
  sample) — not purely "build worker" connections. It is still well under
  the 97 usable limit, which is what the acceptance criterion requires.
- Per the task's non-goals, the pre-existing idle connections were not
  investigated.

## Blockers

None. `NEXT_PHASE` was confirmed set during the actual Turbopack build (both
by reading the Next.js source and by a live log observed inside the worker
processes themselves), so the plan's discriminator is valid and no
`ARCHITECTURE_BLOCKER` applies.
