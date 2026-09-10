# ARCHITECTURE PLAN

> Authored by the manager rather than `gigzman-architect`. The design space here
> is a single constant behind a single environment discriminator in one file, and
> the discriminator was fixed by an explicit user decision. Per the pipeline's
> "skipping stages legitimately" rule, re-deriving that through a full architect
> pass is waste. The plan is still written out and approved, because the coder's
> precondition is an approved plan and because the reasoning should survive.

## Work Item

CD-00 — cap the Postgres pool during the Next static-export phase so `pnpm build`
completes.

## Expected Functional Outcome

`pnpm build` exits 0 and prints its route summary. Runtime behaviour is
unchanged in both production and development.

## Affected Tenants

All six, indirectly — the build is deployment-wide. **Global**, not per-client
gated. No tenant content, route or rendered output is touched.

## Existing Implementation

`lib/db/index.ts` creates one `postgres()` client per process:

```ts
const globalForDb = globalThis as unknown as { client?: ReturnType<typeof postgres> };

const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 3,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.client = client;
```

`NODE_ENV` is `production` during `next build`, so every one of the 15 export
workers takes the `10` branch.

## Owning Modules

`lib/db/index.ts` only. It is the sole database-client factory; every query in
the application resolves through the `db` it exports.

## Dependencies

`postgres` (postgres-js), `drizzle-orm/postgres-js`. No new dependency. No new
environment variable — `NEXT_PHASE` is set by Next itself.

## Domain Models

None. No schema, no query, no action.

## Database Changes

**None.** No migration. The constraint being worked around is the server's
`max_connections = 100` (97 usable after `superuser_reserved_connections = 3`),
which is server configuration, not schema.

## Data Access / Server Actions / Routes

Unchanged. No file under `lib/content.ts`, `lib/actions/` or `app/` is touched.

## Rendering Strategy

Unchanged. This does not alter what prerenders — it makes the existing prerender
able to finish. AC 6 depends on that: the resulting route summary is the CD-01
baseline.

## Caching and Revalidation

Unchanged. Neither React `cache()` nor `unstable_cache()` is involved. Pool size
governs concurrent connections, not result caching.

## Per-Client Gating

Not applicable.

## Content / YAML Changes

None.

## Authorization / Tenant Isolation

Unaffected. Pool sizing does not touch `clientId` scoping, and connection reuse
within a pool carries no tenant identity — every query still supplies its own
`clientId` filter.

## Failure Behaviour

If `NEXT_PHASE` is not set during a Next 16 Turbopack build, the discriminator is
false, the pool stays at 10, and the build fails exactly as it does today —
loudly, with `53300`. That is an acceptable failure mode: visible, not silent.

**The coder must confirm `NEXT_PHASE` was actually set**, so that a passing build
is attributable to the fix rather than to timing. If it is not set, that is an
`ARCHITECTURE_BLOCKER`, not an invitation to improvise a different discriminator.

## SEO and Indexing Impact / Analytics

None.

## Design

```ts
// Next runs the static export in 15 worker processes; each is its own Node
// process with its own pool, so the ceiling is workers x max. At the runtime
// value of 10 that is 150 connections against a server allowing 97
// (max_connections 100 less 3 superuser-reserved), and the export dies with
// FATAL 53300 "sorry, too many clients already".
//
// 3 gives 15 x 3 = 45, comfortably under. The runtime value stays 10 and is
// deliberate: functions run in bom1 while the pooler is in ap-southeast-2, so
// each serverless instance wants its own small pool rather than a shared one.
//
// Rejected: lowering the production value to 3 for everyone (penalises the
// runtime for a build-only constraint), and reducing Next's worker count
// (slows every build to fix a database-side limit).
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production";

const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: isBuildPhase ? 3 : isProduction ? 10 : 3,
    prepare: false,
  });
```

`next/constants`' `PHASE_PRODUCTION_BUILD` is the same string and may be imported
instead of the literal, if that import is safe in this module's context. Either
is acceptable; the literal with a comment is the lower-risk default.

The `globalForDb` cache and the `NODE_ENV !== "production"` assignment below it
are untouched.

## Evidence Required

### Build
- `pnpm build` exit code.
- The complete route summary — this is the artifact CD-01 will diff against, so
  it must be captured in full, not summarised.
- The reported static-page count (≈ 9,659).

### Database
- `max_connections` and `superuser_reserved_connections`.
- A `pg_stat_activity` count sampled during the export phase, if obtainable
  without disturbing the run.

### Code
- The `lib/db/index.ts` diff.
- Proof `NEXT_PHASE` was set during the build.

## Expected Files / Modules

- Modified: `lib/db/index.ts`
- Created: `work/CD-00-build-pool-cap/coder-report.md`

Nothing else. `git status --porcelain` is an acceptance criterion.

## Implementation Sequence

1. Read `node_modules/next/dist/docs/` on build phases / `NEXT_PHASE` — this is
   Next 16 and the repo's rules require checking the docs before writing Next
   code.
2. Confirm `NEXT_PHASE` is observable during a build (a temporary log line is
   acceptable; remove it before reporting).
3. Apply the change with its comment.
4. `pnpm build`, capture the full summary.
5. Write `coder-report.md`.

## Acceptance Criteria Mapping

| AC | Implementation | Evidence |
|---|---|---|
| 1 build completes | pool cap | exit code + route summary |
| 2 under the limit | 15 × 3 = 45 < 97 | build completes; sampled connection count |
| 3 runtime unchanged | ternary preserves 10 / 3 | code diff |
| 4 globalThis cache intact | untouched | code diff |
| 5 scope | one file | `git status --porcelain` |
| 6 baseline captured | — | full route summary |

## Non-Goals

Production/development pool sizes; worker-count or `next.config.ts` changes;
external pooling infrastructure; anything in CD-01's file set
(`lib/templates/index.ts`, `lib/tenant.ts`, `lib/domains.ts`).

## Open Decisions

None. The discriminator and the value are fixed by this plan.

## Architecture Conflicts

None. This restores an invariant the repo already assumes — that `pnpm build`
runs — rather than introducing a new one.

## Manager Approval

APPROVED
