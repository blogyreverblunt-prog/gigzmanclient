# CD-00 — `pnpm build` exhausts the database connection limit

## Work Item

`pnpm build` cannot complete. Next runs 15 static-export workers; each is a
separate Node process with its own `postgres()` pool sized `max: 10`, because
`NODE_ENV` is `production` during a build. That is up to 150 connections against
a database allowing 97. The export phase dies with
`FATAL 53300: sorry, too many clients already`.

Cap the pool during the build phase only.

## Affected Tenants

All six, indirectly — nobody can build the deployment. No tenant's content or
rendered output is involved.

## Vertical

Both. `lib/db/index.ts` is vertical-agnostic infrastructure.

## Global or Per-Client Gated

**Global**, and it touches the single database client every query in the
application goes through. Small diff, maximum blast radius: get it wrong and
either the build or every runtime query is affected.

## Expected User-Visible Outcome

None. `pnpm build` completes and prints its route summary.

## Current State

`lib/db/index.ts`:

```ts
const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 3,
    prepare: false,
  });
```

Measured facts:

| Fact | Value |
|---|---|
| Database | `localhost:5432/gigzman_client_sites` |
| `max_connections` | 100 |
| `superuser_reserved_connections` | 3 → **97 usable** |
| Static pages generated | 9,659 |
| Build workers | 15 |
| Pool `max` per worker during build | 10 |
| Worst case | 150 vs 97 |

Observed failure:

```
Generating static pages using 15 workers (0/9659) ...
[cause]: i: sorry, too many clients already
  severity: FATAL, code: 53300
⨯ Next.js build worker exited with code: 1
```

The TypeScript phase passes; only the static-export phase fails.

`max: 10` for the production **runtime** is deliberate — functions run in `bom1`,
the pooler is in `ap-southeast-2`, and each serverless instance wants its own
small pool. That value must not change.

## Required Changes

1. In `lib/db/index.ts`, discriminate the **build phase** from the production
   runtime and use a small pool during the build. `process.env.NEXT_PHASE ===
   "phase-production-build"` is the intended discriminator; `next/constants`
   exports `PHASE_PRODUCTION_BUILD` for the same value.
2. Choose the build pool size so that `workers × max` sits comfortably under 97.
   `3` gives 45 and is the recommended value. State the arithmetic in the
   comment.
3. Leave the runtime values untouched: `10` in production, `3` in development.
4. Comment the *why* — worker count × pool size against a fixed
   `max_connections`, and that the runtime value is deliberate and different.
   This repo's convention is that comments record the reasoning and the rejected
   alternative.

**If `NEXT_PHASE` is not set during a Next 16 Turbopack build**, the cap will not
apply and the build will fail exactly as it does now. Verify empirically. Do
**not** substitute a different discriminator on your own judgement — raise
`ARCHITECTURE_BLOCKER` with what you observed.

## Acceptance Criteria

1. `pnpm build` completes with exit code 0 and prints its route summary.
2. The build's peak connection count stays under the usable limit — evidenced by
   the build completing, and by a sampled `pg_stat_activity` count during the run
   if obtainable.
3. The production runtime pool is still `10`, and development is still `3`.
   Shown by reading the resulting code, and by confirming the discriminator is
   false outside a build.
4. `globalThis` caching behaviour in development is unchanged.
5. No other file is modified. `git status --porcelain` shows `lib/db/index.ts`
   and the work-directory artifacts only.
6. The full route summary from the successful build is captured — this becomes
   the CD-01 baseline, so it must list per-route prerendered counts.

## Evidence Required

### Build
- `pnpm build` exit code and the complete route summary table.
- The static-page count it reports (expected ≈ 9,659).

### Database
- `SELECT setting FROM pg_settings WHERE name = 'max_connections'` — the limit
  the arithmetic is against.
- If practical, a `pg_stat_activity` count sampled during the export phase.

### Code
- The final `lib/db/index.ts` diff.
- Confirmation that `NEXT_PHASE` was actually set during the build — otherwise
  AC 1 passing was luck, not the fix.

## Non-Goals

- Changing the production or development pool sizes.
- Reducing Next's worker count, or any `next.config.ts` change.
- Connection pooling infrastructure (pgBouncer, a hosted pooler).
- Anything in CD-01. Do not touch `lib/templates/index.ts`, `lib/tenant.ts` or
  `lib/domains.ts`.
- Investigating the 9 idle connections already present on the database.

## Constraints

- `lib/db/index.ts` is on the path of every query in the application. A mistake
  here is not a build failure, it is a production outage.
- The `globalThis` client cache exists so dev hot reloads don't exhaust
  connections. Preserve it exactly.
- There is no test suite. `pnpm build` is the typecheck — and here it is also the
  acceptance test.
- A full build takes a long time on this repo (9,659 pages). Budget for it and
  do not run it more than necessary.

## Reference

`work/CD-01-tenant-registry/manager-analysis.md` — the blocker section, where
this failure was measured.
