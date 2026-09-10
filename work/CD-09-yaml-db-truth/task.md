# CD-09 — Resolve YAML vs database as source of truth

## Work Item

`clients/<slug>/*.yaml` is the seed source; the dashboard writes the database.
`pnpm seed:client <slug> --force` overwrites dashboard edits without warning.
Once a non-technical user is editing through a dashboard, that is a data-loss bug
waiting to fire. Make the database authoritative and give the YAML path a guard
and a return route.

**Run this immediately after CD-03.** The risk begins the moment the first
dashboard edit exists.

## Affected Tenants

All six, as data. No rendered output changes.

## Vertical

Both.

## Global or Per-Client Gated

Global — it changes tooling behaviour for every tenant.

## Expected User-Visible Outcome

Nothing on any public site. For the team: `pnpm seed:client --force` refuses to
destroy dashboard edits, a new `pnpm export:client` regenerates a client's YAML
from the database, and `pnpm check:content` reports on dashboard-created clients
instead of silently skipping them.

## Current State

- `scripts/seed-client.ts` loads `clients/<slug>/profile.yaml` and
  `content/*.yaml` into the database. Rows are upserted; with `--force` the
  update set is the full YAML values (`set: force ? values : { updatedAt }`), so
  every dashboard edit is overwritten.
- `scripts/check-content.ts` iterates directories under `clients/`. A client
  created through the dashboard has no directory, so it is **silently skipped** —
  it reports nothing and exits successfully, which reads as a pass.
- `firm_settings.updated_at` and most content tables carry `updatedAt`, so
  "edited since seed" is answerable.
- `profile.yaml` carries a `_status` map (`verified` / `placeholder` / `pending`)
  per field, and content files carry a document-level `_status`. That discipline
  is what `check-content.ts` reports on and must survive a round trip.

## Required Changes

1. **Guard `--force`.** Refuse when a client's database rows are newer than the
   YAML file, unless an explicit `--overwrite-dashboard-edits` flag is passed.
   The refusal must print what it would have clobbered — which tables, how many
   rows, and how much newer — not just decline.
2. **Add `pnpm export:client <slug>`.** Regenerate `clients/<slug>/profile.yaml`
   and `content/*.yaml` from the database, preserving the `_status` maps and the
   file header comments naming sources. Round-tripping a client
   (`export` → `seed --force`) must be a no-op on the database.
3. **Make dashboard-created clients visible to `check-content.ts`.** Either have
   the export write the folder, or teach the checker to read from the database.
   Pick one, implement it, and state the choice and its reason in a comment. What
   must not remain true: a client that exists and is live but produces no output
   from the pre-delivery check.
4. Document both commands in `README.md` and in `AGENTS.md`'s command table,
   alongside the existing `seed:client` / `check:content` entries.

## Acceptance Criteria

1. `pnpm seed:client <slug> --force` on a client whose `firm_settings.updated_at`
   is newer than its `profile.yaml` refuses, names what it would overwrite, and
   exits non-zero.
2. The same command with `--overwrite-dashboard-edits` proceeds.
3. `pnpm seed:client <slug> --force` on a client with no dashboard edits behaves
   exactly as it does today.
4. `pnpm export:client <slug>` regenerates the YAML for an existing tenant, and
   `_status` values, source-naming header comments and field ordering survive.
5. Round trip is lossless: `export:client` then `seed:client --force
   --overwrite-dashboard-edits` leaves the database materially unchanged. Show a
   before/after comparison of the affected rows.
6. `pnpm check:content <slug>` produces a real report for a client created
   through the dashboard — not silence, and not a spurious pass.
7. `pnpm check:content` with no argument still covers every client, however each
   was created.
8. No public page or rendered output changes.

## Evidence Required

- **The guard:** AC 1, 2 and 3 executed, with the actual console output of each.
- **Round trip:** AC 5 with a row-level diff of `firm_settings` and one content
  table before and after.
- **Export fidelity:** the `git diff` of a re-exported existing client — ideally
  empty or explainable line by line. An unexplained diff means the exporter is
  lossy.
- **Dashboard-created client:** create one (or reuse CD-03's throwaway), run
  `pnpm check:content <slug>`, show the output.
- **Build:** `pnpm build` green; no rendered output changed.

## Non-Goals

- Two-way live sync between YAML and the database. YAML is a bootstrap and audit
  record, not a mirror.
- Changing the `_status` vocabulary or the thin-content rules in
  `check-content.ts`.
- Migrating existing clients away from YAML.

## Constraints

- **Never invent client facts.** An exporter that fills a blank field with a
  plausible value is a defect, not a convenience. Empty must round-trip as empty,
  and `pending` must round-trip as `pending`.
- These scripts run with `tsx --env-file=.env.local`. A bcrypt hash in that file
  contains `$` and must stay escaped; an unencoded `@` in `DATABASE_URL` breaks
  the connection. Both have produced convincing false defects here — rule them
  out before filing a bug.
- `scripts/dry-run.ts` is stale and fails for unrelated reasons. Do not report it
  as a regression, and do not fix it here.

## Reference

`docs/client-dashboard-brief.md` §10, and `AGENTS.md` "Never invent client facts".
