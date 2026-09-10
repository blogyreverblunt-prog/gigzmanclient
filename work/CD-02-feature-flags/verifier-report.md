# VERIFICATION REPORT

## Work Item

CD-02 — Per-client feature flags move from code to the database. Five
`Set<string>` allowlists across four source files become `clients.features`
(jsonb, migration `0007`), read through one synchronous validating accessor
`featureEnabled(host, key)` in the new `lib/features.ts`. 16 files, all five
real-estate tenants, acceptance bar = nothing user-visible changed.

I did not write this code. Everything below is something I ran or loaded
myself; the coder's report was treated as input to be checked, not trusted.

## Verdict

VERIFY_FAIL

One blocking finding (MEDIUM, V-1). **Every acceptance criterion passes on
evidence I observed directly, all three named traps are closed, tenant
isolation is intact and the database is correct.** The single blocking item is
a pair of factually false claims that this increment *introduced* into
`lib/premium-v2/home-sections.ts` — a file the approved plan designates as a
deliverable whose comments "must contradict nothing in the code" and which
CD-03 will lift verbatim as operator-facing helper text. It is the same defect
class the coordinator raised to a fix cycle inside this very increment
(Defect Cycle 1, `lib/tenant.ts`). The correction is two clauses in one file
and requires no rebuild — see *Required Correction*.

## Acceptance Criteria Coverage

| AC | Evidence | Status | Detail |
|---|---|---|---|
| 1. `features` jsonb, NOT NULL, default `{}`, backfilled exactly | `information_schema` + six-row `features->>` matrix + `pg_indexes`, run by me | **PASS** | `jsonb / NO / '{}'::jsonb`. Six rows match the plan matrix exactly. Only `clients_pkey`, `clients_slug_unique` — no index added. Backfill reproduces all five HEAD allowlists exactly (cross-checked against `git show HEAD:` for all three gate files). |
| 2. No helper `async`; no call site `await`s; `FooterV2` takes a prop, no lookup | Full call-site enumeration + three plan greps + green `pnpm build` | **PASS** | All 5 delegates + `featureEnabled` are plain `export function`. Zero `await <gate>` hits. `FooterV2` lines 35/38/68 only; import deleted, `clientSlug` gone from the file. No `"use client"` file imports a gate (the two grep hits are comment-only mentions — verified: no `import` line in either). |
| 3. Build green; per-tenant prerendered counts match baseline | My own `rm -rf .next && pnpm build`, counts re-derived from `.next/server/app/site` | **PASS** | 42 / 546 / 547 / 5005 / 1071 / 1071 — identical to `prerendered-before.txt` (the hard gate) **and** to `prerendered-after.txt`. Per-family identical to `families-before.txt`. |
| 4. Home-page composition unchanged for all five | Marker sweep on a live dev server, all five tenants | **PASS** | `high-properties map=0 mgmt=2`; other four `map=1 mgmt=0`. Opt-out polarity intact. |
| 5. `/property-management` 200 on high-properties, 404 on four | Live 5×6 status matrix + prerender `.meta` statuses | **PASS** | Both signals agree: 200 / 404×4. |
| 6. `/home-loan` 200 on three, 404 on two | Live matrix + `.meta` + per-family prerender counts | **PASS** | 200 on high-properties, nayra, urban-flat; 404 on evergreen, expert. `home-loan=524` on exactly the three DSA tenants, `0` on the other two. |
| 7. `/vastu/gurugram` 200 only on high-properties; `/vastu` for all five | Live matrix incl. control row | **PASS** | `/vastu/gurugram` 200 / 404×4; `/vastu` 200 on all five. `vastu-gurugram=3699` only on high-properties. |
| 8. Sitemap per tenant unchanged — **sorted URL-set identity** (AMENDED) | Six families fetched and sorted by me; per-tenant gated-URL derivation | **PASS** | 120 / 1300 / 308 / 56 / 18 / 20 — matches. Gated URLs land on exactly the right tenants (see *Results*). Reordering explicitly not treated as a regression. |
| 9. Footer "Home Loans" on exactly three tenants | `>Home Loans<` count sweep | **PASS** | 1 on high-properties, nayra, urban-flat; 0 on evergreen, expert. |
| 10. A DB flip changes output with no code change | **My own** toggle proof on `urban-flat-real-estate` | **PASS** | See *Edge Cases Verified*. |

## Architecture "Evidence Required" Coverage

| Item | Collected by me | Status |
|---|---|---|
| Build: before/after prerendered counts per tenant | Re-derived from my own clean build; diffed against both baseline artifacts | **Covered** |
| Build: per-family counts (the direct proof against Risk 1) | Re-derived; identical to `families-before.txt` | **Covered** |
| Database: `features` of all six rows after migration | Queried directly via a scratch `postgres` client | **Covered** |
| Rendered pages: full 5 × 6 status matrix, not a sample | Ran the complete matrix on a live dev server | **Covered** |
| Home-page composition for high-properties + another | Ran all five, not two | **Covered** |
| Sitemap: URL counts per tenant | Fetched all six families, sorted, derived per-tenant gated URLs | **Covered** |
| Toggle proof: flip a flag, show the change, flip back | Ran my own two-flag proof with full stop / `rm -rf .next` / SQL / restart discipline | **Covered** |
| Content check (`pnpm check:content high-properties`) | Ran it | **Covered** — `3 placeholder · 3 pending`, unchanged |
| Scope isolation vs `pre-state.txt` | Ran the diff | **Covered** — 14 added, 0 removed |

No `Evidence Required` item was missing. Two I judged under-evidenced by the
coder and re-derived independently rather than accepting: the per-family
prerender counts, and the toggle proof.

## Evidence Collected

**Trap 1 — `StaticParamTenant` widening.** `lib/static-params.ts:56-62` types
`features: ClientFeatures` and the `activeTenants()` select at line 72 projects
`features: clients.features`. Both home-loan `generateStaticParams` gates
(`home-loan/[slug]/page.tsx:29`, `home-loan/[slug]/[amount]/page.tsx:16`) call
`homeLoanEnabled(tenant)` on that projection. Confirmed on disk, not by
argument: `home-loan=524` prerendered pages for `high-properties`,
`nayra-realtors` and `urban-flat-real-estate`, `0` for the other two;
`vastu-gurugram=3699` for `high-properties` only. Had the projection been
missed, both families would be `0` with the build still green. They are not.

**Trap 2 — `FeatureHost.features` REQUIRED.** `lib/features.ts:54`:

```ts
export type FeatureHost = { features: ClientFeatures };
```

Not optional. Not relaxed. The doc comment above it states why. This is the
single line the manager flagged as "must not be simplified" and it is intact.

**Trap 3 — the `profile.yaml` `features:` collision.** `scripts/seed-client.ts`
does **not** write `clients.features`. The local is renamed to
`settingsFeatures` (line 155) with all five uses updated (lines 183-187), so
`features` is an unbound identifier in that file — the only remaining
occurrence of the bare word is inside the explanatory comment at line 111. The
`clients` upsert (lines 122-142) writes `slug`, `vertical`, `displayName`,
`isDemo`, `templateKey` and nothing else.

Proven against live rows rather than by reading — `profile.yaml` `features:`
still maps to `firm_settings`, and `clients.features` is untouched by seeding:

| slug | YAML `reviews/pricing/awards/client_logos/team` | `firm_settings` row |
|---|---|---|
| arora-k-associates | false/true/true/true/true | false/true/true/true/true |
| high-properties | true/true/false/false/true | true/true/false/false/true |
| urban-flat-real-estate | true/true/false/false/**false** | true/true/false/false/**false** |

`urban-flat-real-estate` was fully re-seeded with the renamed code during
Defect Cycle 1 and its `clients.features` still holds the five CD-02 keys
(`homeLoan:true, propertyMap:true`, three false) — not `{"reviews":true,…}`.
The trap is closed and observed closed.

**Vastu `generateStaticParams` NOT harmonised.** Both gates keep the
re-resolution verbatim:

```ts
const t = await getTenantBySlug(tenant.slug);
if (!t || t.vertical !== "realestate" || !vastuSectorsEnabled(t)) return [];
```

at `vastu/gurugram/[sector]/page.tsx:23-24` and
`vastu/gurugram/[sector]/[aspect]/page.tsx:29-30`. CD-01's `isActive` guard and
`templateKeyFor` validation therefore still apply to the two largest
prerendered families.

**Backfill reproduces the old allowlists exactly.** Read out of
`git show HEAD:` for each file and compared to the live rows:

| Flag | HEAD source | Live rows | Match |
|---|---|---|---|
| `propertyMap` | `MAP_SECTION_DISABLED = {high-properties}`, opt-**out** | high-properties `false`, other four `true` | ✔ |
| `propertyManagementSection` | `{high-properties}` | high-properties only | ✔ |
| `propertyManagementPage` | `{high-properties}` | high-properties only | ✔ |
| `vastuSectors` | `{high-properties}` | high-properties only | ✔ |
| `homeLoan` | `{high-properties, nayra-realtors, urban-flat-real-estate}` | those three | ✔ |

The opt-out polarity — failure mode #3 — is correct. It is not inverted.

**`FEATURE_DEFAULTS` polarity matches each HEAD null-guard.** HEAD:
`propertyMapSectionEnabled(null) → true`; the other four `→ false`.
`FEATURE_DEFAULTS` = `propertyMap: true`, other four `false`. Exact.

**`featureEnabled` is fail-safe on junk.** I exercised the real module (not a
transcription) through `tsx`. Every row below returned the documented defaults
— no throw, no coercion:

```
FEATURE_DEFAULTS {"propertyMap":true,"propertyManagementSection":false,
                  "propertyManagementPage":false,"vastuSectors":false,"homeLoan":false}

host = null                                 -> defaults
host = undefined                            -> defaults
features = {}            (CD-03 new tenant) -> defaults
features = JSON null     ('null'::jsonb)    -> defaults
features = "yes"         (string)           -> defaults
features = 42            (number)           -> defaults
features = []            (array)            -> defaults
values "yes"/1/null/"false"/0               -> defaults   (not coerced)
JSON.parse('{"__proto__":{"homeLoan":true}}')-> defaults  (prototype not read)
Object.create({homeLoan:true,vastuSectors:true}) -> defaults (Object.hasOwn holds)
high-properties migration value             -> map=false pmSec/pmPg/vastu/loan=true
evergreen migration value                   -> map=true, other four false
```

The `Object.hasOwn` hardening from CD-01 Amendment 1 is genuinely load-bearing:
the inherited-key row would have returned `homeLoan=true` under a bare index
read. It returns `false`.

**A newly created tenant gets `'{}'`.** Seeding a scratch `cafirm` profile with
no `features` block produced `features = "{}"` on the new row — the column
default, resolving to the documented defaults. (Row and scratch directory
deleted immediately; `count(*)` back to 6.)

## Commands Executed

```
diff <(sort work/CD-02-feature-flags/pre-state.txt) <(git status --porcelain | sort)
git diff -- <the 7 CD-02-only files>
git show HEAD:lib/premium-v2/home-sections.ts | lib/vastu/enabled.ts | lib/home-loan/enabled.ts
rm -rf .next && pnpm build                                  exit 0
find .next/server/app/site -name '*.html' | ... | uniq -c   (per-tenant counts)
find .next/server/app/site/<t>/{home-loan,vastu/gurugram} -name '*.html' | wc -l
grep -o '"status": *[0-9]*' .next/server/app/site/<t>/*.meta
pnpm check:content high-properties
pnpm seed:client zz-cd02-verify                             (4 negative + 1 positive case)
npx tsx <scratchpad>/probe.mts                              (featureEnabled junk probe)
node --env-file=.env.local <scratchpad>/sql.mjs "<SQL>"     (schema, indexes, rows, toggles)
curl ... localhost:3000  (5x6 status matrix, composition, footer, sitemaps, negatives)
pnpm dev                                                    (baseline + 2 toggle cycles)
```

`pnpm build` was run **once**. `pnpm dry-run` was **not** run — it is stale.
SQL ran through a scratch runner in the session scratchpad resolving the
project's own `postgres@3.4.9`; nothing was committed to the repo. No
production code, `clients/*/` YAML or migration was modified by me.

## Results

**There is no test suite.** `package.json` defines no `test`, `lint` or
`typecheck` script — I confirmed this by reading it. Nothing below is a claim
that tests passed. `pnpm build` is the typecheck; everything else is
observation.

**Build.** `rm -rf .next && pnpm build` exit 0. No Postgres `53300` (which
would be a CD-00 regression) and no `53200`. Per-tenant, re-derived by me:

```
     42 arora-k-associates
    546 evergreen-real-estate
    547 expert-realtors
   5005 high-properties
   1071 nayra-realtors
   1071 urban-flat-real-estate

diff vs prerendered-before.txt (the hard gate)  -> no output
diff vs prerendered-after.txt                   -> no output
```

Per-family — **the signal that matters here**, because the aggregate says only
that *something* moved:

```
high-properties          home-loan=524   vastu-gurugram=3699  property-management=1
evergreen-real-estate    home-loan=0     vastu-gurugram=0     property-management=1
expert-realtors          home-loan=0     vastu-gurugram=0     property-management=1
nayra-realtors           home-loan=524   vastu-gurugram=0     property-management=1
urban-flat-real-estate   home-loan=524   vastu-gurugram=0     property-management=1

diff vs families-before.txt  -> no output
```

The coder's note that `property-management.html` is emitted for all five (a
prerendered `notFound()` still writes a file) is correct and I confirmed the
sharper signal — the sibling `.meta`:

```
high-properties        pm=200   loan=200   vastuG=200      (no "status" key)
evergreen-real-estate  pm=404   loan=404   vastuG=404
expert-realtors        pm=404   loan=404   vastuG=404
nayra-realtors         pm=404   loan=200   vastuG=404
urban-flat-real-estate pm=404   loan=200   vastuG=404
```

Build-time gating and request-time gating agree on every cell.

**Sitemap (AC 8 as amended).** Counts: `core=120 properties=1300 register=308
localities=56 updates=18 services=20`. Because I have no pre-change server to
diff against, I derived set identity from the gate semantics instead, which is
stronger: the gated URLs must land on exactly the tenants the old allowlists
named.

```
core sitemap, per tenant   home-loan  vastu/gurugram  vastu(base)
high-properties                1            1              1
evergreen-real-estate          0            0              1
expert-realtors                0            0              1
nayra-realtors                 1            0              1
urban-flat-real-estate         1            0              1

register sitemap  high-properties=251  evergreen=9  expert=16  nayra=16  urban-flat=16
```

Exactly the HEAD allowlist membership. A reordered file is not a regression and
was not treated as one.

**Content check.** `pnpm check:content high-properties` →
`3 placeholder · 3 pending`. Unchanged; no YAML was touched by this increment.

## Tenant Sweep

Live dev server, `TENANT_MODE=path`, `/realestate/temp-premium-v2/<slug>`.
The full matrix, not a sample — all five real-estate tenants, plus the cafirm
tenant and the negative cases.

| Tenant | URL | Status | Rendered correctly? |
|---|---|---|---|
| high-properties | `/` | 200 | Yes — `map=0 mgmt=2 homeLoanLink=1` |
| high-properties | `/property-management` | 200 | Yes |
| high-properties | `/home-loan` | 200 | Yes |
| high-properties | `/vastu/gurugram` | 200 | Yes |
| high-properties | `/vastu`, `/calculators` | 200, 200 | Yes (controls unmoved) |
| evergreen-real-estate | `/` | 200 | Yes — `map=1 mgmt=0 homeLoanLink=0` |
| evergreen-real-estate | `/property-management`, `/home-loan`, `/vastu/gurugram` | 404, 404, 404 | Yes — real 404s, no `loading.tsx` on these routes |
| evergreen-real-estate | `/vastu`, `/calculators` | 200, 200 | Yes |
| expert-realtors | `/` | 200 | Yes — `map=1 mgmt=0 homeLoanLink=0` |
| expert-realtors | `/property-management`, `/home-loan`, `/vastu/gurugram` | 404, 404, 404 | Yes |
| expert-realtors | `/vastu`, `/calculators` | 200, 200 | Yes |
| nayra-realtors | `/` | 200 | Yes — `map=1 mgmt=0 homeLoanLink=1` |
| nayra-realtors | `/home-loan` | 200 | Yes |
| nayra-realtors | `/property-management`, `/vastu/gurugram` | 404, 404 | Yes |
| nayra-realtors | `/vastu`, `/calculators` | 200, 200 | Yes |
| urban-flat-real-estate | `/` | 200 | Yes — `map=1 mgmt=0 homeLoanLink=1` |
| urban-flat-real-estate | `/home-loan` | 200 | Yes |
| urban-flat-real-estate | `/property-management`, `/vastu/gurugram` | 404, 404 | Yes |
| urban-flat-real-estate | `/vastu`, `/calculators` | 200, 200 | Yes |
| arora-k-associates (cafirm) | `/cafirm/arora-k-associates` | 200 | Yes — in the blast radius of the shared `(public)/layout.tsx`; unaffected, 42 prerendered pages unchanged |

Two tenants were required; I ran all six. `high-properties` (rich content, 5,005
pages) and `expert-realtors` / `evergreen-real-estate` (thin, 546-547 pages)
both behave correctly.

**Negative cases — all still hold:**

```
wrong template segment  /realestate/temp-advisory/high-properties  -> 307 -> http://localhost:3000/
direct /site/<slug>     /site/high-properties                      -> 307 -> http://localhost:3000/
/cafirm/<realestate-slug>  /cafirm/high-properties                 -> 200   (CD-01 standing finding, ruled)
```

## Edge Cases Verified

**Toggle proof (AC 10) — run by me, not accepted from the report.** Guinea pig
`urban-flat-real-estate`. `high-properties` never mutated. `vastuSectors`
never enabled on a second tenant, not even briefly — I used
`propertyMap` + `propertyManagementPage`, both cheap. Full discipline on every
step: stop dev server → `rm -rf .next` → SQL → restart. No result raced the
~10-minute cache window.

Two flags flipped in one statement, so the proof also shows they are
independent:

```sql
UPDATE clients SET features = features || '{"propertyMap":false,"propertyManagementPage":true}'::jsonb
  WHERE slug = 'urban-flat-real-estate';
```

| Tenant | map marker | mgmt marker | `/property-management` | Reading |
|---|---|---|---|---|
| urban-flat (before) | 1 | 0 | 404 | baseline |
| **urban-flat (flipped)** | **0** | **0** | **200** | both flags took effect; `mgmt=0` proves the *section* flag stayed false while the *page* flag flipped — they are distinct |
| evergreen (during flip) | 1 | 0 | 404 | **unchanged — the flip is per-tenant, not global** |
| high-properties (during flip) | 0 | 2 | 200 | **unchanged — no cross-tenant leakage** |
| urban-flat (restored) | 1 | 0 | 404 | restore observed, not asserted |

After restore I re-probed **all five** tenants and every cell matches the
baseline matrix exactly (see *Tenant Sweep*).

**Other edges probed:**

- `featureEnabled` against 10 malformed `features` shapes (see *Evidence
  Collected*) — every one yields the documented default, no throw.
- `'null'::jsonb` specifically: the `!f` guard runs before the `typeof` check,
  so `typeof null === "object"` does not slip through. Confirmed.
- Prototype-chain access: both a `__proto__` JSON payload and a genuine
  prototype-inherited key return defaults. `Object.hasOwn` holds.
- A tenant created with no `features` at all → `'{}'` → defaults. Observed on a
  real seeded row.
- `cafirm` with no `template:` still seeds successfully (exit 0) — the
  Defect Cycle 1 fix does not over-reject.

**Environment traps ruled out before filing anything:** the `.env.local` `$`
bcrypt-expansion trap and the `DATABASE_URL` `@`-encoding trap did not fire
(seeding, migration and every query succeeded); the `globalThis`-cached
Postgres client was handled by a **full** dev-server restart on every toggle
step, never a hot reload.

## Regression Check For Prior Defects

**Defect Cycle 1, Fix 1 — `lib/tenant.ts`'s `isActive` comment.** I verified
every claim in the replacement comment against the production code myself
rather than reading the report's prose:

| Claim in the comment | My check | Result |
|---|---|---|
| Public tree resolves through `getTenantBySlug` | grep across `(public)/**` | Holds |
| Tenant dashboard resolves the same way and `notFound()`s | `dashboard/layout.tsx:21-22` | `getTenantBySlug` then `notFound()` — holds |
| Bare login page covered "through layout nesting" | `dashboard/login/` contains **only** `page.tsx`, no layout | Holds — it nests under the gated layout |
| **Exception:** `(public)/properties/loading.tsx` reads `getTenant()` | file lines 1, 6 | Holds — `import { getTenant }`, `await getTenant()` |
| Server Actions are **NOT** gated — `auth-actions.ts` | line 30: `.where(eq(clients.slug, tenantSlug))` | Holds — no `isActive` |
| … `getSessionUser()` in `lib/auth.ts` | lines 86-87: `.where(eq(clients.slug, tenantSlug))` | Holds — no `isActive` |
| … `lib/actions/submit-query.ts` | lines 53, 58: slug / customDomain only | Holds — no `isActive` |
| `getTenant()` does not apply the guard either | `grep -c isActive` in its body → `0` | Holds |

The comment claims exactly what the code delivers and nothing more, including
naming the one exception. **What would break if reverted:** nothing
functional — it is comment-only, and I confirmed no enforcement was added
(`getTenant()` still has zero `isActive` references, the three action files are
unchanged). What would return is the false guarantee that deactivation stops
writes, which would mislead whoever implements CD-03's Active switch into
believing the write path is already closed. The gap itself is correctly
*documented*, not fixed — which is what was asked.

**Defect Cycle 1, Fix 2 — `scripts/seed-client.ts` template validation.**
Re-run by me against a throwaway scratch client (no live YAML touched;
validation throws before any write, and the scratch row and directory were
deleted afterwards — `count(*)` confirmed back to 6):

| Case | profile.yaml | Exit | Message |
|---|---|---|---|
| A | `vertical: realestate`, **no `template:`** | **1** | `sets vertical: "realestate" but names no template, which is not a template this codebase can render. Valid keys: premium-v2. Nothing was written.` |
| B | `template: ''` | **1** | same (empty counts as missing) |
| C (control) | `template: premiumv2` | **1** | `sets template: "premiumv2", which is not a template …` — the pre-existing rejection still fires with its original message |
| D | `template: 'premium-v2 '` | **1** | rejected as *unrecognised*, **not** silently trimmed into validity |
| E | `vertical: cafirm`, **no `template:`** | **0** | seeded — stays valid, as required |

Case E is the one that would break if the check were predicated on the key
rather than the vertical. It passes. **What would break if reverted:** case A
would seed successfully and exit 0, producing a tenant whose every page
`getTenantBySlug` 404s — the silent dead site the CD-01 block exists to
prevent. Traced in the code at `scripts/seed-client.ts:89-91`:

```ts
const missingForRealestate = vertical === "realestate" && templateKey === null;
const unrecognised = templateKey !== null && !Object.hasOwn(TEMPLATE_REGISTRY, templateKey);
if (missingForRealestate || unrecognised) { … }
```

One code path, one throw, `Object.hasOwn` (not `in`) — consistent with CD-01's
Amendment 1.

## Correctness Review

**Module ownership.** Preserved. `proxy.ts`, `lib/content.ts` and
`lib/actions/**` are untouched (`git status --porcelain` returns nothing for
all three) — `proxy.ts` still has no database access. `lib/tenant.ts`'s
CD-02 change is comment-only; it still re-verifies vertical and template
(`row.vertical === "realestate" && !templateKeyFor(row)`). Template copy stayed
in `lib/premium-v2/` — no copy moved into a component. `lib/features.ts` has
**zero imports** (`grep -c "^import"` → `0`), so it can never drag `lib/db`
into a client bundle.

**Database and migration safety.** `drizzle/0007_chubby_runaways.sql` chains
correctly: `_journal.json` runs `idx 6 / 0006_cultured_mikhail_rasputin` →
`idx 7 / 0007_chubby_runaways`. The DDL is the unedited generated
`ALTER TABLE "clients" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;`
— a `NOT NULL` with a *constant* default, so Postgres 11+ stores it in the
catalogue: no table rewrite, no long lock. The three backfill `UPDATE`s are
appended after `--> statement-breakpoint` (the project's established pattern,
ruled not a violation), are absolute assignments rather than merges, and are
therefore idempotent. Predicated on explicit slugs, so a realestate row created
later correctly gets `'{}'`. No index, no `CHECK`, no `pgEnum`, no new table —
verified against `pg_indexes`. Verified against live rows: 6 rows, correct
values, `arora-k-associates` untouched at `{}`.

**Tenant isolation.** Unweakened, and slightly strengthened. No query was
added, removed or re-predicated anywhere. `activeTenants()` gained one column
in its projection and no change to its `WHERE eq(clients.isActive, true)`.
`lookupClientBySlug` and `sitemapClients()` are untouched. Not one
`lib/content.ts` query changed. `clients` *is* the tenant registry, so
`clientId` scoping does not apply to it. The strengthening is real: the old
helpers took a bare `string` and would answer for any slug handed in; the new
ones take the row, so a gate can only be answered from the row being rendered.
My toggle proof demonstrated this empirically — flipping urban-flat's flags
moved nothing on evergreen or high-properties.

**Authorization.** No Server Action added or changed, so no new POST surface
and no new `assertOwnership` obligation. Nothing is trusted from `FormData` —
there is no form. `requireUser` / `requireAdmin` unchanged. The plan's ruling
that `clients.features` belongs on the *platform* dashboard rather than the
tenant dashboard is recorded for CD-03 with its reasoning (a tenant admin
flipping `homeLoan` is a compliance incident; flipping `vastuSectors` is an
availability incident for every other tenant on the deployment). Correct call.

**Rendering strategy.** No public route gained `headers()` — the single grep
hit under `(public)/**` is a *comment* at `layout.tsx:32` explaining why the
tenant comes from `params`. Public pages still use
`getTenantBySlug(params.tenant)`. `featureEnabled()` is a pure synchronous
function over a value already in hand and touches no dynamic API. All four
`generateStaticParams` still return the complete param set including the
ancestor `tenant` (`paramsForEachTenant` still spreads
`{ tenant: tenant.slug, ...row }`) — proven by the unchanged per-family
prerender counts on disk, not asserted. `revalidate = 300` on
`(public)/layout.tsx` unchanged.

**Caching.** No cache key changed and no cached function was added. I traced
`lookupClientBySlug`: its `unstable_cache` parts are `["client-by-slug"]` plus
`slug`, and `slug` is still the only thing that varies the result — `features`
is a column on the row that key already returned, not a new varying argument.
So the key still includes every argument that changes the result. No
`revalidatePath` / `revalidateTag` was added, correctly, because this increment
adds no write path; each mutation this increment performs is zero. The ~10
minute lag window is documented, not fixed — ruled to CD-03.

**Cross-tenant blast radius.** Six shared files were edited. Every edit is the
same mechanical parameter substitution applied uniformly, not a change made for
one client — no new `Set<string>` of slugs exists anywhere in the repo (grep
for all five old constants returns nothing). `(public)/layout.tsx` reaches all
six tenants including `arora-k-associates`; its 42 prerendered pages are
unchanged and its home page returns 200. `FooterV2`, `PremiumV2Home`,
`PremiumV2CalculatorsIndexPage`, `PremiumV2EmiCalculatorPage` and
`lib/premium-v2/tools.ts` reach all five real-estate tenants, and all five
render their correct composition. `lib/premium-v2/positioning.ts` (hero copy)
correctly untouched.

**Content integrity.** No `clients/*/profile.yaml` was edited (`git status`
shows only the five ` M` entries already present in `pre-state.txt` from
CD-00/CD-01). No YAML field added, no `_status` changed, no client fact
invented — the five flag values were copied out of the four HEAD source files
and I verified each against `git show HEAD:`. No address, phone, year or
testimonial appears anywhere in the diff. `check:content` count unchanged.

**Regulatory compliance.** RERA: no listing surface changed; `PropertyCard` is
untouched, so the "registration pending" treatment is intact. ICAI: verified
against the live row — `arora-k-associates` has `reviews_enabled = false`, and
`reviewsEnabled` is not read by this increment. The `settingsFeatures` rename
did not disturb firm settings — the three-tenant YAML↔`firm_settings`
cross-check above is exact. DSA: which tenants assert the authorised
channel-partner claim is unchanged (the same three, before and after), and the
*reason* the flag is opt-in survives in `lib/home-loan/enabled.ts`'s rewritten
comment, which names CD-03's confirmation checkbox. Illustrative-image
reasoning (the property-management artwork being High-Properties-branded) is
preserved in `lib/premium-v2/home-sections.ts`.

**SEO and indexing.** Sitemap URL sets land on exactly the right tenants; no
page appeared or disappeared. Canonicals derive from
`joinPath(basePathFor(tenant), path)`, which reads `templateKey`, not
`features` — untouched. `robots` untouched. No doorway page created. The gated
`/` still redirects to the platform login (307). No new indexing behaviour.

**Link correctness.** No hardcoded tenant prefix in any changed file. The only
two repo-wide hits for `temp-premium-v2` are `lib/domains.ts:5` (a comment,
untouched) and `lib/templates/index.ts:47` (`urlSlug: "temp-premium-v2"` — the
registry definition, which is the legitimate single source). `FooterV2` still
builds every href through `joinPath(basePath, …)`, so host mode is safe.

**Evidence quality.** The coder's evidence proves the behaviour rather than
merely accompanying it, with one caveat I corrected: the per-family counts and
the toggle proof are the two items where a wrong result would be invisible in
the aggregate, so I re-derived both from scratch. Both reproduced. The coder's
correction about `property-management.html` being emitted for all five tenants
is accurate and I confirmed the `.meta` status is the sharper signal.

**Scope discipline.** `diff <(sort pre-state.txt) <(git status --porcelain |
sort)` reports **14 added entries, 0 removed**, all on the plan's *Expected
Files / Modules* list. Every plan exclusion holds: `proxy.ts`,
`lib/content.ts`, `lib/actions/**`, `lib/domains.ts`, `lib/templates/**`,
`lib/verticals/**`, `lib/premium-v2/positioning.ts`, `README.md`,
`next.config.ts` and all `clients/*/profile.yaml` carry no CD-02 change. As the
brief notes, `git diff --stat` on `AGENTS.md`, `lib/db/schema.ts`,
`scripts/seed-client.ts`, `lib/static-params.ts` and `lib/sitemap.ts` shows
cumulative CD-00+CD-01+CD-02 line counts — **not** scope creep, and not
reported as such.

**`AGENTS.md`.** The false claim is gone (`grep "toggles currently live in
code"` → no output) and the replacement table is accurate against the code,
including the non-uniform default column and the note that hero copy
(`lib/premium-v2/positioning.ts`) is the one switch still in code.

## Blocking Findings

### Finding ID

V-1

### Severity

MEDIUM

### Requirement

The approved plan, *Content / YAML Changes → The four comment rewrites —
deliverables, not decoration*: "Each replacement must record the **new
mechanism** while keeping the **why**, and **must contradict nothing in the
code**." The same section designates these comments as the literal source CD-03
lifts its on-screen operator helper text from. Defect Cycle 1 of this increment
established, at the coordinator's direction, that a comment claiming a
guarantee the code does not deliver is a defect requiring correction.

### Evidence (file path + code, or URL + output)

`D:\PROJECTS\gigzmanclient\lib\premium-v2\home-sections.ts`, lines 62-64 — a
claim **introduced by this increment** (absent from HEAD; confirmed with
`git show HEAD:lib/premium-v2/home-sections.ts`):

```
 * Gate: `clients.features.propertyManagementPage`, default **false**. Off,
 * `/property-management` is a real 404 for that tenant rather than an empty
 * page, and the route drops out of that tenant's sitemap.
```

`/property-management` is in **no** tenant's sitemap, whatever the flag says:

```
$ grep -n "property-management\|propertyManagement" lib/sitemap.ts
(no output)
```

and the rendered core sitemap for `high-properties` — the one tenant where the
flag is **on** — contains no such entry:

```
$ curl -s localhost:3000/sitemaps/core.xml | grep -o '<loc>[^<]*</loc>' \
    | grep high-properties | sed 's|.*high-properties||' | sort
/area-converter   /calculators   /calculators/emi   /calculators/rental-yield
/calculators/stamp-duty   /contact   /firm-profile   /home-loan
/legal/…(5)   /localities   /maps/gurgaon   /properties   /rental-yield
/updates   /vastu   /vastu/gurugram
```

Per-tenant count of `/property-management` in the core sitemap: `0` for all
five tenants, including `high-properties`.

Same file, lines 11-13 — a second claim introduced by this increment:

```
 * signatures — they are called inline in JSX and from `lib/sitemap.ts` — and
```

`lib/sitemap.ts` calls no helper from this file. Its only four gate calls are
`homeLoanEnabled(client)` (lines 138, 160) and `vastuSectorsEnabled(client)`
(lines 141, 222), both from sibling modules. And
`propertyManagementPageEnabled` is called from
`(public)/property-management/page.tsx:27,53`, which is not "inline in JSX".

### Actual Behaviour

`lib/premium-v2/home-sections.ts` asserts (a) that turning
`propertyManagementPage` off removes the route from that tenant's sitemap, and
(b) that this file's three helpers are called from `lib/sitemap.ts`. Neither is
true of the code as it stands. The first also implies the inverse — that the
route *is* in a tenant's sitemap when the flag is on — which is likewise false.

### Expected Behaviour

Each rewritten comment states only what the code delivers. Per the plan, these
comments are the source for CD-03's operator-facing helper text; an operator
toggling `propertyManagementPage` off must not be told it produces an SEO
consequence that does not occur, and a maintainer must not be sent to
`lib/sitemap.ts` looking for a call that is not there.

### Required Correction

Two clause deletions in `lib/premium-v2/home-sections.ts`, nothing else:

1. Line 64: delete `, and the route drops out of that tenant's sitemap`. The
   preceding claim — that off produces "a real 404 for that tenant rather than
   an empty page" — is **true** and I verified it (no `loading.tsx` on this
   route; observed 404 on four tenants at request time and `"status":404` in
   the prerender `.meta`). Keep it.
2. Lines 11-13: drop `and from `lib/sitemap.ts`` from the synchronicity
   justification. The synchronicity requirement itself is real for these three
   helpers — `propertyMapSectionEnabled` and `propertyManagementSectionEnabled`
   *are* called inline in JSX at `PremiumV2Home.tsx:166,186` — so keep the
   claim, just drop the sitemap half. Optionally note that
   `propertyManagementPageEnabled` is called from the route's page body.

**No rebuild or re-sweep is needed to clear this.** A comment cannot move a
route; every behavioural result in this report remains valid. Re-verification
is a read of the two edited hunks.

Do **not** "fix" this by adding `/property-management` to `lib/sitemap.ts` —
that would change sitemap output, which AC 8 freezes, and it is a design
decision outside this increment. See NB-1.

## Non-Blocking Improvements

**NB-1 — `/property-management` is an indexable 200 page in no sitemap.** On
`high-properties` the page returns 200 and is prerendered, but it appears in
none of the six sitemap families. That is a real (small) SEO omission and it is
**pre-existing** — `lib/sitemap.ts` never referenced the route, before or after
CD-02. It is the underlying fact that makes V-1's comment false. Recommend a
future work item decide whether the route should be listed (gated on
`propertyManagementPageEnabled`, symmetrically with `/home-loan` and
`/vastu/gurugram`, which *are* gated in `coreEntries`). Out of scope here
because AC 8 freezes sitemap output.

**NB-2 — stale terminology at `lib/sitemap.ts:221`.** The comment still reads
"Gated on the same allowlist the pages use". There is no allowlist any more;
it is a row flag. The substance is still true (the pages and the sitemap do use
the same gate), so this is cosmetic, and the line was not part of the plan's
four designated comment rewrites. Worth a one-word fix whenever that file is
next opened.

**NB-3 — `pnpm dry-run` is stale.** Standing finding, unchanged: it references
removed templates and will fail. Not caused by this increment; not run.

**NB-4 — `/cafirm/<realestate-slug>` returns 200.** Re-observed
(`/cafirm/high-properties` → 200). CD-01 standing finding, explicitly ruled to
CD-03. Not attributed to this increment.

**NB-5 — ruled items confirmed as correctly untouched.** I checked each and
agree with the rulings; none is reported as blocking:
`lib/verticals/realestate.ts:56` links "Property Management" unconditionally
though the page 404s for four tenants (confirmed present, pre-existing, nav
config is static per-vertical data); `sitemapClients()` filters only on
`isActive`; `FooterV2.tsx:243` renders `new Date().getFullYear()` in a
`"use client"` component (present in HEAD, correctly untouched — I confirmed
the diff adds no new non-deterministic render); no cache tag on
`lookupClientBySlug`; `getTenant()` / login / Server Actions do not enforce
`isActive` (documented accurately — see *Regression Check*);
`properties/loading.tsx` soft-404. I have no disagreement with any of these
rulings.

**NB-6 — generated snapshot not reviewed line by line.**
`drizzle/meta/0007_snapshot.json` is machine-written. I verified the journal
entry and the DDL rather than the snapshot body, consistent with existing
practice.

## Delivery Readiness

A pass is not a delivery, and this increment does not move the delivery bar
either way — it adds no YAML field and changes no client fact.

`pnpm check:content high-properties` still reports **3 placeholder · 3
pending**, unchanged by CD-02:

```
PENDING (renders nothing):  firm.firm_registration_number
                            analytics.search_console_verification
                            notification_email
PLACEHOLDER (must be replaced before delivery):
                            content/legal.yaml      (whole file)
                            content/localities.yaml (whole file)
                            content/updates.yaml    (whole file)
```

`high-properties` is a **live client on its own domain** and is still carrying
three whole placeholder content files, including `localities.yaml` — which
feeds the locality rows the vastu sector matrix (3,699 prerendered pages)
draws its four corridor figures from. That is a large indexed surface built on
demo data. It is outside CD-02's scope and was correctly not touched, but it
should not be lost: it is a delivery blocker for that tenant independent of
this work item.

The other four real-estate tenants were not content-checked in this pass
(CD-02 touches no content). Recommend a `check:content` sweep across all six
before any delivery milestone.

**State left behind:** database in the exact six-row migration state, proven by
a final `select` — `urban-flat-real-estate`'s `homeLoan` is **`true`**, as
required after the toggle proofs; `high-properties` never mutated; the scratch
verification row and directory removed and `count(*) = 6` confirmed. A
`next dev` server is running on `localhost:3000`, matching how the machine was
found. `.next` holds a dev build. No production code, `clients/*/` YAML or
migration was modified by me. `current-status.md` not touched.

## Final Verdict

VERIFY_FAIL

The engineering is sound and the increment does what it set out to do: five
gates moved from code to row data, nothing user-visible changed, all ten
acceptance criteria pass on evidence I observed directly, all three named traps
are demonstrably closed, tenant isolation is intact and slightly strengthened,
and both Defect Cycle 1 fixes hold when traced through the production code
rather than read from the report.

It fails on one thing: this increment introduced two false statements into
`lib/premium-v2/home-sections.ts`, a file the approved plan makes a deliverable
on the explicit condition that its comments "contradict nothing in the code",
and which CD-03 will lift as operator-facing helper text. That is precisely the
defect class the coordinator raised to a fix cycle inside this increment for
`lib/tenant.ts`; applying a weaker standard to the same class in the same
increment would not be independent verification.

Clearing it is two clause deletions in one file. No rebuild, no re-sweep and no
database work is required — every other result in this report stands.

---

# RE-CHECK — Defect Cycle 2 (V-1)

Appended after the coder landed `## Defect Cycle 2`. Confined to reading, as
directed: no rebuild, no database mutation, no re-run of any sweep. Every result
in the report above stands unchanged and is not restated here.

## Verdict on re-check

**VERIFY_PASS for CD-02.**

## V-1 — both false clauses are gone, and the fix was made the right way

**Clause 1 — the false sitemap claim.** `lib/premium-v2/home-sections.ts:66-68`
now reads:

```
 * Gate: `clients.features.propertyManagementPage`, default **false**. Off,
 * `/property-management` is a real 404 for that tenant rather than an empty
 * page.
```

It stops exactly at the statement I verified as true. The false half is deleted.

**It was not "fixed" by adding the route to the sitemap** — I checked rather
than took this on trust:

```
$ grep -n "property-management\|propertyManagement" lib/sitemap.ts
(no match)
```

`lib/sitemap.ts` still emits no `/property-management` entry for any tenant, so
AC 8's frozen sitemap output is untouched and NB-1 remains an open, correctly
un-acted-on observation.

**Clause 2 — the false call-site claim.** The header now names the real sites
(lines 11-15) and adds an explicit negative (lines 17-18):

```
 * signatures — two of them are evaluated inline in `PremiumV2Home`'s JSX, and
 * the third gates `(public)/property-management`'s `generateMetadata` and its
 * page body — and take the tenant row instead of a slug, …
 *
 * Unlike the two sibling gate modules, nothing in this file is read by
 * `lib/sitemap.ts` or by any `generateStaticParams`.
```

**I verified the negative is true, not merely present.** The complete call-site
set for this file's three helpers is four sites and no others:

| Site | Context | Matches the comment? |
|---|---|---|
| `PremiumV2Home.tsx:166` | `{propertyMapSectionEnabled(tenant) ? (` | inline JSX ✔ |
| `PremiumV2Home.tsx:186` | `{propertyManagementSectionEnabled(tenant) ? (` | inline JSX ✔ |
| `property-management/page.tsx:27` | inside `generateMetadata` (declared line 24) | ✔ |
| `property-management/page.tsx:53` | inside `PropertyManagementPage` (declared line 46) | ✔ |

- `lib/sitemap.ts`'s only gate calls are lines 138, 160 (`homeLoanEnabled`) and
  141, 222 (`vastuSectorsEnabled`) — both sibling modules, none from this file.
  Negative half 1 holds.
- `grep -c "generateStaticParams" (public)/property-management/page.tsx` → **0**,
  and neither `PremiumV2Home` site is in a `generateStaticParams`. Negative half
  2 holds.

The explicit negative is factually correct and is a genuine improvement over
what I asked for — it forecloses the re-derivation rather than just removing the
error.

## The sibling headers were correctly left alone — confirmed, not assumed

The same sentence that was false in `home-sections.ts` is **true** in both
sibling modules, so leaving them untouched was right:

| Module | Claim | My check |
|---|---|---|
| `lib/vastu/enabled.ts:36-37` | "called from `generateStaticParams` and from `lib/sitemap.ts`" | gSP at `vastu/gurugram/[sector]/page.tsx:24` and `[sector]/[aspect]/page.tsx:30` (both verified in the main pass); sitemap at `lib/sitemap.ts:141, 222`. **True** |
| `lib/home-loan/enabled.ts:25-26` | "called from `generateStaticParams`, from `lib/sitemap.ts` and inline in JSX" | gSP at `home-loan/[slug]/page.tsx:29` and `[slug]/[amount]/page.tsx:16`; sitemap at `138, 160`; inline JSX at `(public)/layout.tsx:198` — `homeLoanEnabled={homeLoanEnabled(tenant)}`. **All three true** |

## The remaining claims in `home-sections.ts` — I re-checked them independently

I did not accept the coder's nine-row self-check table; I re-derived the two the
coordinator singled out and confirmed the rest against measurements already in
this report.

| Claim | My evidence | Result |
|---|---|---|
| "four of the five live tenants want it" (`propertyMap`) | `select count(*) where features->>'propertyMap'='true'` → **4**; five realestate rows, `high-properties` the one `false` | **True** |
| "~3,700 prerendered routes per tenant" (`vastu/enabled.ts`) | my own measured `vastu-gurugram=3699` | **True** — an honest approximation, not a rounded-up figure |
| `propertyMap` default **true**, other four **false** | `lib/features.ts:36-40`, and the junk-value probe returned exactly this | **True** |
| `propertyMap` opt-**out**, the two management flags opt-**in** | live rows + `FEATURE_DEFAULTS` | **True** |
| Off ⇒ a *real* 404, not a soft 200 shell | no `loading.tsx` on the route; observed 404 at request time and `"status":404` in the prerender `.meta` | **True** |
| "base vastu pages stay available to every real-estate tenant" | `/vastu` = 200 on all five in my status matrix | **True** |
| three DSA tenants named by slug (`home-loan/enabled.ts`) | six-row `select` | **True** |
| "re-seeding cannot null out a live flag" | observed live — `urban-flat-real-estate` re-seeded in Defect Cycle 1 kept its five CD-02 keys | **True** |

No further false statement in `lib/premium-v2/home-sections.ts`. The file now
reads clean.

## Ruling on the third item — the vastu §11 cross-reference

The coder found a real problem of a different shape and was right to flag it
rather than bury it: citing §11's "a 4th tenant" wording when exactly **one**
tenant carries the matrix would have read as "the 2nd and 3rd are unrestricted",
inverting the intent. The count is correct —
`select count(*) where features->>'vastuSectors'='true'` → **1**
(`high-properties`) — and the operational guidance it adds ("read it as one more
than now"; the cost lands on each tenant added, not on an ordinal) is true and
agrees with the brief's intent. The addition itself is approved and I do not
treat it as scope creep.

**But the specific question I was asked — does it contradict the brief as it now
stands — has to be answered no longer.** It does, in one sentence, and only
because the coordinator's own brief edit landed after the comment was written.

`lib/vastu/enabled.ts:31`:

```
 * §11 words that entry as "a 4th tenant", which dates from when three tenants
 * carried the matrix.
```

`docs/client-dashboard-brief.md` §11 (line 568) now reads:

```
- enabling `vastuSectors` for **any tenant beyond those that already have it**
  — each one adds ~3,700 prerendered routes; three was the most that ever
  shipped (a 32-minute build) and a 4th blew the deployment output limit and
  failed after 41 minutes. Exactly **one** tenant carries it today, so read this
  as "one more than now", not as an ordinal — the earlier wording, "a 4th
  tenant", implied that the 2nd and 3rd were free.
```

§11 no longer *words* the entry as "a 4th tenant". It words it as "any tenant
beyond those that already have it", and refers to "a 4th tenant" only in the
**past tense**, as the wording it corrected. The comment's present-tense
quotation is therefore stale, and the paragraph it introduces is now redundant —
§11 says the same thing itself, and says it better. The CD-03 hard-cap paragraph
(brief lines 186-198) agrees: hard cap of three in the Server Action, exactly one
today, "enabling even a second is a §11 decision".

**Recorded as non-blocking (NB-7), and here is the reasoning, so my V-1 standard
stays legible rather than looking selectively applied:**

- V-1's two claims were **false when written** and false in a direction that
  produces a **wrong action** — an operator told a toggle has an SEO effect it
  does not have, a maintainer sent to a file that holds no such call. That is
  why V-1 blocked.
- This one was **true when written**, was made stale by an *approved improvement*
  to the cited document landing afterwards, and points in the **same direction**
  as the corrected text. A reader who follows the pointer lands on §11 and finds
  guidance that is stronger than the comment promised. There is no wrong action
  available at the end of this path.

Blocking CD-02 for a staleness created by the coordinator's own subsequent edit
would penalise a sequencing artifact, not a correctness failure.

**Recommended follow-up (not a condition of this pass):** delete
`lib/vastu/enabled.ts:31-34` — the four-line paragraph beginning "§11 words that
entry as". It is self-contained and deletes cleanly, the substance now lives in
§11, and the sentence above it already says "turning it on for **another**
tenant", which is the correct non-ordinal wording. That leaves the tree with
zero stale cross-references. One deletion, no rebuild.

## Scope and state after Defect Cycle 2

```
diff <(sort work/CD-02-feature-flags/pre-state.txt) <(git status --porcelain | sort)
  -> 14 added, 0 removed        (unchanged from my main pass)
```

Both files edited this cycle (`lib/premium-v2/home-sections.ts`,
`lib/vastu/enabled.ts`) were already in the 14. No new file. `lib/sitemap.ts`,
the two sibling headers and `current-status.md` untouched.
`docs/client-dashboard-brief.md` sits under an untracked `docs/` directory, so
the coordinator's §11 edit has no effect on CD-02's scope accounting.

Database left exactly as required and re-confirmed by `select`: **6 rows**,
`urban-flat-real-estate` `homeLoan = true`, `high-properties` untouched
(`homeLoan = true`, `vastuSectors = true`), `vastuSectors` enabled on exactly
**1** tenant, `propertyMap` on **4**. I mutated nothing this cycle.

## What the verdict rests on

`VERIFY_PASS` for CD-02 rests on the main pass's findings, all of which stand
untouched — a comment-only cycle cannot move a route, a status code, a sitemap
or a row, and I re-ran none of them:

- All 10 acceptance criteria passing on evidence I observed directly, including
  the per-tenant (`42 / 546 / 547 / 5005 / 1071 / 1071`) and per-family
  (`home-loan=524 ×3`, `vastu-gurugram=3699 ×1`) prerender counts I re-derived
  from my own clean build.
- All three named traps closed: the `StaticParamTenant` widening carries
  `features`; `FeatureHost.features` is **required**, not optional; the
  `profile.yaml` collision is guarded and proven closed against live rows.
- Tenant isolation intact and slightly strengthened; no `headers()` on a public
  route; no cache key lost an argument; module boundaries respected.
- Both Defect Cycle 1 fixes verified by tracing production code, not prose.
- The backfill reproducing all five HEAD allowlists exactly, with the
  `propertyMap` opt-out polarity intact.

and on V-1 — the sole blocking finding — now being **cleared**: both false
clauses are gone, the fix was made by deletion rather than by changing sitemap
output, the added negative is factually true, and no further false statement
remains in that file.

The one item raised in this cycle (NB-7) is non-blocking for the reason given
above and is a single-paragraph deletion whenever convenient.

## Final Verdict (superseding the VERIFY_FAIL above)

VERIFY_PASS
