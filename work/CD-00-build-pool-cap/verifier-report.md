# VERIFICATION REPORT

## Work Item

CD-00 — cap the Postgres pool to `max: 3` during Next's static-export phase
(`NEXT_PHASE === "phase-production-build"`) so `pnpm build` does not exhaust
`max_connections`. Single production file changed: `lib/db/index.ts`.

## Verdict

VERIFY_PASS

## Acceptance Criteria Coverage

| AC | Evidence | Status | Detail |
|---|---|---|---|
| 1. `pnpm build` exit 0 + route summary | `work/CD-00-build-pool-cap/build-output.log` (230 lines, `EXIT_CODE=0`, full route tree, 9659/9659) | PASS* | *See "Independent Re-run" below — my own reproduction hit a different, out-of-scope failure. Original artifact is genuine and internally consistent. |
| 2. Peak connections stays under usable limit | `pg-activity-samples.log` (peak 61); my own sampler (peak 58) | PASS | Both well under 97 usable; neither run produced `53300`. |
| 3. Runtime pool still `10` prod / `3` dev | `git diff lib/db/index.ts` | PASS | Traced the ternary myself, see Correctness Review §2. |
| 4. `globalThis` caching unchanged | `git diff lib/db/index.ts` | PASS | The cache line is byte-for-byte untouched. |
| 5. No other file modified | `git status --porcelain` | PASS | Only `lib/db/index.ts` is a tracked change attributable to this session. |
| 6. Full route summary captured as CD-01 baseline | `build-output.log` read in full | PASS | Complete, not truncated; folded `[+N more paths]` groupings are Next's own console format for `generateStaticParams` routes, not a truncation. |

## Architecture "Evidence Required" Coverage

| Item | Covered | How |
|---|---|---|
| Build exit code + full route summary | Yes | Read `build-output.log` in full (230 lines); reproduced independently (see below). |
| Static-page count ≈9,659 | Yes | `9659/9659` in both the artifact and my own run's progress lines before it failed. |
| `max_connections` / `superuser_reserved_connections` | Yes | Self-queried: `max_connections=100`, `superuser_reserved_connections=3` — matches task/report exactly. |
| `pg_stat_activity` sample during export | Yes | Coder's log (peak 61) + my own independent sampler (peak 58, 5s cadence, `work/CD-00-build-pool-cap/verifier-pg-samples-rerun.log`). |
| Code diff | Yes | `git diff lib/db/index.ts`, read in full below. |
| Proof `NEXT_PHASE` was set during the build | Yes, independently | Not accepted on the report's prose — traced through Next's own source myself (see Edge Cases). |

## Evidence Collected

**The diff** (`git diff lib/db/index.ts`, the entire production change):

```ts
+const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
+const isProduction = process.env.NODE_ENV === "production";
+
 const client =
   globalForDb.client ??
   postgres(connectionString, {
-    max: process.env.NODE_ENV === "production" ? 10 : 3,
+    max: isBuildPhase ? 3 : isProduction ? 10 : 3,
     prepare: false,
   });
```
The `globalForDb` declaration and `if (process.env.NODE_ENV !== "production") globalForDb.client = client;` line below it are outside the diff hunk — untouched.

**Database, self-queried** (`postgres` package, `max:1`, deleted after use):
```
max_connections = 100
superuser_reserved_connections = 3   → 97 usable
```
Matches task.md and coder-report.md exactly.

**`NEXT_PHASE` discriminator — independently traced through Next's own source**, not accepted from the report's prose:
- `node_modules/.../next/dist/build/index.js:1212`: `process.env.NEXT_PHASE = _constants1.PHASE_PRODUCTION_BUILD;` — set immediately before `createStaticWorker` spawns the 15 workers at line 1213. Same assignment exists in the ESM build (`dist/esm/build/index.js:1144`).
- `dist/shared/lib/constants.js:337-339`: `PHASE_PRODUCTION_BUILD = 'phase-production-build'`, `PHASE_PRODUCTION_SERVER = 'phase-production-server'`, `PHASE_DEVELOPMENT_SERVER = 'phase-development-server'` — three distinct values.
- `dist/lib/worker.js:80-85`: each worker's env is built as `{ ...process.env, ...(farmOptions.forkOptions?.env ?? {}), IS_NEXT_WORKER: 'true', NODE_OPTIONS: ... }` — a full spread of the *parent* process's env (which by line 1212 already has `NEXT_PHASE` set) into the child's `forkOptions.env`, passed to jest-worker's `ChildProcessWorker`. This is the actual mechanism by which the 15 build workers inherit `NEXT_PHASE`.
- Grepped all of `next/dist` for `process.env.NEXT_PHASE =`: the **only** assignment sites are `build/index.js:1212` and its ESM twin. It is never set during `next dev` or `next start`. This independently confirms AC3's "discriminator is false outside a build" — not just by absence of a counter-example, but by there being no code path anywhere in Next that sets it outside `next build`.

This matches the coder's claim exactly, and I reached it the same way (source read) plus my own live confirmation that `TEMP-DEBUG NEXT_PHASE = phase-production-build` only appears inside `build-output.log`/`coder-report.md` (evidence artifacts), never in tracked source — see Edge Cases.

## Commands Executed

```
node --env-file=.env.local <scratch>.mjs        # pg_settings + pg_stat_activity, self-run, deleted after
pnpm build                                       # independent re-run, background, ~2min, FAILED exit 1
<scratch sampler>.mjs                            # pg_stat_activity every 5s during that re-run
git diff lib/db/index.ts / git status --porcelain / git diff --stat
grep NEXT_PHASE across node_modules/next/dist
```

## Results

No test suite exists (`package.json` defines no `test`/`lint`/`typecheck` script) — this reports real command output, not test-passing claims.

**Original build artifact** (`build-output.log`): `EXIT_CODE=0`, `9659/9659` pages, full route tree. Read in full; matches the report's reproduction verbatim line-for-line, including the folded `[+N more paths]` groupings and the 18 `TEMP-DEBUG NEXT_PHASE = phase-production-build` lines (debug line since removed from source — confirmed absent from every tracked file).

**My independent re-run** (`verifier-build-rerun.log`): exit code 1. Failed partway through the export phase (between `2414/9659` and `4829/9659`) with **two** Postgres errors, both `code: '53200', severity: 'ERROR'`, `[cause]: i: out of memory`, `routine: 'MemoryContextAllocationFailure'` — on `/site/high-properties/sectors/84` and `/site/high-properties/properties/birla-navya-avik-phase-1-sector-63a`. This is **not** the connection-exhaustion error (`53300`) the fix targets. My concurrent connection sampler (`verifier-pg-samples-rerun.log`) shows the pool behaving exactly as designed up to the failure: baseline 13 → peak **58** (≈13 baseline + 45 = 15×3 build connections, arithmetic matches the code's comment) → `ECONNRESET` when the build worker died → back to baseline. See "Reproducibility Note" below for why this is not attributed to the reviewed diff.

## Tenant Sweep

Not applicable to this increment. Per task.md ("No tenant's content or rendered output is involved") and the architecture plan ("Rendering Strategy: Unchanged... Content / YAML Changes: None"), `lib/db/index.ts` is vertical-agnostic infrastructure with no route, component, or content file touched — confirmed by `git diff --stat` showing only `lib/db/index.ts` as this session's change. A page-level request sweep across tenants would exercise code this diff cannot affect; the relevant evidence instead is the build's own route summary (unchanged route shapes vs. what the codebase's route files define) and the connection-count sampling above.

## Edge Cases Verified

1. **`NEXT_PHASE` exclusivity** — grepped all of `next/dist` for `process.env.NEXT_PHASE =`; the only assignment is in `build/index.js` (and its ESM twin), immediately before worker spawn. It is not set by `next dev` or `next start`, so `isBuildPhase` is deterministically `false` in both the production runtime and development — confirms AC3 by source, not just by the report's log.
2. **`globalForDb` cache during a build** — during `next build`, `NODE_ENV === "production"`, so the pre-existing (unedited) line `if (process.env.NODE_ENV !== "production") globalForDb.client = client;` was already `false` in that phase before this diff, and remains `false` now — the new `isBuildPhase` logic does not touch, gate, or interact with this line at all. Reverting the fix would restore `max: 10` for all 15 build workers (150 vs 97 usable) and reproduce the original `53300`; the cache line is orthogonal and would behave identically either way.
3. **No debug/scratch code left behind** — `grep -r "TEMP-DEBUG"` (excluding `node_modules`/`.next`) matches only `coder-report.md` and `build-output.log` (both evidence artifacts, expected). No match in any `.ts`/`.tsx`/`.js` source file. `_tmp-db-check.mjs` does not exist and does not appear in `git status`.
4. **Environment traps ruled out** — `DATABASE_URL` parses and connects cleanly via my own scratch scripts (no unencoded `@` issue); no bcrypt-hash `.env.local` interaction is on this code path at all (`lib/db/index.ts` only reads `DATABASE_URL`); the `globalForDb` hot-reload cache is unmodified and, per point 2, inert during a build regardless.

## Regression Check For Prior Defects

Not applicable — `coder-report.md` contains no defect-cycle section; this was a first-pass, plan-compliant implementation with "Deviations: None."

## Reproducibility Note (Independent Re-run — Out of Scope, Not Attributed to the Diff)

My own re-run of `pnpm build`, using the exact code under review, failed with a **different** error class than the one CD-00 fixes: Postgres `53200 out of memory` (a backend memory-allocation failure, `MemoryContextAllocationFailure`), not `53300` (too many clients). Diagnosis:

- Postgres is a native Windows service (no Docker), with `shared_buffers = 128MB` and `work_mem = 4MB` — a small local-dev configuration.
- System memory at the time of my re-run: **4.24 GB free of 15.41 GB total** — thin headroom for 15 concurrent Turbopack/Node worker processes plus Postgres plus everything else already resident, on the very next full build attempt after the coder's own successful run and my own verification tooling.
- My connection sampler confirms the pool cap itself worked correctly throughout: peak 58 connections (13 baseline + 45 = 15×3, exactly the arithmetic in the code's comment), never approaching 97, and `53300` did not recur in either run.

This points to a pre-existing, machine-level resource ceiling (Postgres memory configuration + thin system RAM headroom under back-to-back heavy builds) — not something `lib/db/index.ts`'s pool-*count* cap could or was scoped to address (CD-00's Non-Goals explicitly exclude "Connection pooling infrastructure" and any database-tuning change). It is not evidence that the reviewed diff is wrong: the diff's one job — keeping concurrent connections under 97 — held in both runs, including the one that failed for an unrelated reason.

This is not filed as a Blocking Finding against the diff. It is flagged here with high visibility because CD-01 is stated to diff its own build against `build-output.log` as a regression baseline: if CD-01's own build run hits this same `53200`, that must not be misread as a CD-01 regression. Recommend the manager either (a) raise local Postgres `shared_buffers`/`work_mem` modestly, or (b) ensure builds run on an otherwise-idle machine, before treating repeated build success as guaranteed.

## Correctness Review

1. **Functional correctness vs. every AC** — all six ACs satisfied; see table above.
2. **Module ownership** — `lib/db/index.ts` remains the sole database-client factory; `git diff --stat` confirms no other module (`proxy.ts`, `lib/tenant.ts`, `lib/templates/index.ts`, `lib/domains.ts`) was touched, matching the explicit Non-Goals.
3. **Database/migration safety** — no migration; none needed. No file under a migrations directory appears in `git status`.
4. **Tenant isolation** — not implicated. This file issues no queries and carries no `clientId`; `lib/db/schema.ts`'s header comment ("Every content table is scoped by `clientId`") confirms the isolation pattern lives elsewhere, unaffected by pool sizing.
5. **Authorization** — not implicated; no route, action, or `FormData` handling touched.
6. **Rendering strategy** — no `headers()` added; no route file touched; route shapes in the build output are unchanged from what the app's route files define.
7. **Caching** — no `cache()`/`unstable_cache()`/`revalidatePath` touched.
8. **Cross-tenant blast radius** — the change is uniform across all six tenants by design (global infra file); no client-specific branching introduced.
9. **Content integrity** — not implicated; no YAML touched.
10. **Regulatory compliance** — not implicated.
11. **SEO/indexing** — not implicated; `/sitemap.xml` still appears as static (`○`) in the route summary.
12. **Link correctness** — not implicated; no route/link code touched.
13. **Evidence quality** — the artifact evidence is genuine (verified for internal consistency and against independently-derived Next source facts), and I supplemented it with my own DB queries, source tracing, and a full independent build re-run rather than accepting the report's prose.
14. **Scope discipline** — `git diff --stat` shows exactly one file (`lib/db/index.ts`, +18/-2) attributable to this session; `AGENTS.md` and `app/layout.tsx` pre-date the session per the brief and `git log -- lib/db/index.ts` shows no other recent history on the file.

## Blocking Findings

None. No defect in `lib/db/index.ts`, its scope, or its evidence was found.

## Non-Blocking Improvements

- None specific to this diff. (The reproducibility risk above is deliberately not filed here or as blocking — it is a standing environment/infrastructure item for the manager, orthogonal to this five-line change.)

## Delivery Readiness

No tenant content or rendered output is touched by this increment (confirmed: infra-only, zero route/YAML files in the diff), so the "placeholder content" delivery check does not apply here. The one caveat to delivery readiness is the reproducibility note above: the captured `build-output.log` is a genuine, complete, non-truncated success and is fit to serve as the CD-01 baseline, but its "the build always succeeds" implication should not be read as guaranteed on this machine under memory pressure — that risk is unrelated to CD-00's fix and does not block this increment's delivery.

## Final Verdict

VERIFY_PASS — `lib/db/index.ts`'s pool-cap change is correct, minimal, and exactly as scoped: the runtime ternary reduces to the original `10`/`3` values (traced through Next's own source, not just the report's prose, to confirm `NEXT_PHASE` is exclusively set during `next build`), the `globalForDb` hot-reload cache is byte-for-byte untouched and provably inert during a build, no other file was modified, no debug/scratch code was left behind, and the build-connection arithmetic (15×3=45) is independently confirmed twice (peaks of 61 and 58) to stay well under the 97-connection limit with no recurrence of `53300`. The single open item — an out-of-scope Postgres-memory (`53200`) failure I hit on my own back-to-back re-run — is documented with high visibility for the manager and for CD-01's baseline planning, but is not a defect in the reviewed diff and does not block this increment.
