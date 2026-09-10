# IMPLEMENTATION RESULT

## Work Item

CD-02 — Per-client feature flags move from code to the database. Five
`Set<string>` allowlists across four source files become `clients.features`
(jsonb), read through one synchronous validating accessor. No helper became
async; no call site gained an `await`; the one Client Component consumer
receives a boolean prop.

## Outcome

**Complete. The approved plan was implemented literally, in its 13-step
sequence.** `pnpm build` is green at 9,659 pages, and every per-tenant and
per-family prerendered count is byte-identical to the pre-change baseline. The
5 × 6 rendered status matrix, the home-page composition markers, the footer
link counts and all six sitemap URL sets are identical before and after. All
three toggle proofs passed and the database is restored to its exact six-row
migration state.

No `ARCHITECTURE_BLOCKER`. No deviation from the plan. Nothing user-visible
changed, which was the acceptance bar.

## Affected Tenants

All five `realestate` tenants — `high-properties`, `evergreen-real-estate`,
`expert-realtors`, `nayra-realtors`, `urban-flat-real-estate`.

`arora-k-associates` (cafirm) keeps `features = '{}'`. It is nonetheless in the
blast radius of one file: `app/site/[tenant]/(public)/layout.tsx` is the layout
for every public page of all six tenants (the changed calls sit inside the
`isPremiumV2` branch). Its home page and the `/vastu`, `/calculators` control
rows were exercised implicitly by the identical build output (42 prerendered
pages, unchanged).

`high-properties` — the live client on its own domain — **was never mutated.**
`urban-flat-real-estate` was the sole guinea pig, as the plan required.

## Implemented Components

1. **`lib/features.ts`** (new) — `ClientFeatures`, `FeatureKey`,
   `FEATURE_DEFAULTS`, `FeatureHost`, `featureEnabled()`. Zero imports
   (verified: `grep -c "^import" lib/features.ts` → `0`), so it can never drag
   `lib/db` into a client bundle.
2. **`clients.features jsonb NOT NULL DEFAULT '{}'`** — one column, one
   migration, a three-statement backfill.
3. **`lib/static-params.ts`** — `StaticParamTenant` and the `activeTenants()`
   projection widened a second time, **before** either home-loan gate was
   touched.
4. **Five delegates** in the three gate modules, keeping every name, file,
   export and synchronous signature; five `Set<string>` constants deleted; four
   comments rewritten to describe the new mechanism while keeping the *why*.
5. **22 flag-helper call sites** substituted from `xEnabled(tenant.slug)` to
   `xEnabled(tenant)`; **4 `toolLinksFor`/`toolHrefsFor` sites** re-shaped.
6. **`FooterV2`** — the one client-boundary crossing — now takes a
   `homeLoanEnabled: boolean` prop and performs no lookup.

## Files Created

- `D:\PROJECTS\gigzmanclient\lib\features.ts`
- `D:\PROJECTS\gigzmanclient\drizzle\0007_chubby_runaways.sql`
- `D:\PROJECTS\gigzmanclient\drizzle\meta\0007_snapshot.json` (generated)

## Files Modified

Schema and migration
- `D:\PROJECTS\gigzmanclient\lib\db\schema.ts` — `features` column on `clients` + type-only import
- `D:\PROJECTS\gigzmanclient\drizzle\meta\_journal.json` — generated, now ends at `idx 7 / 0007_chubby_runaways`

Core logic
- `D:\PROJECTS\gigzmanclient\lib\static-params.ts`
- `D:\PROJECTS\gigzmanclient\lib\premium-v2\home-sections.ts`
- `D:\PROJECTS\gigzmanclient\lib\vastu\enabled.ts`
- `D:\PROJECTS\gigzmanclient\lib\home-loan\enabled.ts`
- `D:\PROJECTS\gigzmanclient\lib\premium-v2\tools.ts`
- `D:\PROJECTS\gigzmanclient\lib\sitemap.ts`

Call sites (all under `app\site\[tenant]\(public)\`)
- `layout.tsx`, `calculators\[key]\page.tsx`, `home-loan\page.tsx`,
  `home-loan\[slug]\page.tsx`, `home-loan\[slug]\[amount]\page.tsx`,
  `property-management\page.tsx`, `vastu\page.tsx`, `vastu\gurugram\page.tsx`,
  `vastu\gurugram\[sector]\page.tsx`, `vastu\gurugram\[sector]\[aspect]\page.tsx`

Components
- `D:\PROJECTS\gigzmanclient\components\realestate\premium-v2\FooterV2.tsx`
- `D:\PROJECTS\gigzmanclient\components\realestate\premium-v2\PremiumV2CalculatorsIndexPage.tsx`
- `D:\PROJECTS\gigzmanclient\components\realestate\premium-v2\PremiumV2EmiCalculatorPage.tsx`
- `D:\PROJECTS\gigzmanclient\components\realestate\templates\PremiumV2Home.tsx`

Seed path and docs
- `D:\PROJECTS\gigzmanclient\scripts\seed-client.ts` — local rename + comment. **No new write.**
- `D:\PROJECTS\gigzmanclient\AGENTS.md` — the per-client-toggle table and preamble

Every one of these 26 entries is on the plan's `## Expected Files / Modules`
list. Nothing outside it was touched.

## Database Migrations

`drizzle/0007_chubby_runaways.sql`. Generated DDL, unedited:

```sql
ALTER TABLE "clients" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;
```

followed, after `--> statement-breakpoint`, by the plan's three-statement
backfill verbatim (grouped by identical feature vector; each an absolute
assignment, so idempotent; predicated on explicit slugs, not on `vertical`).
`arora-k-associates` is deliberately untouched and keeps `'{}'`.

Applied with `pnpm db:migrate` → `migrations applied successfully!`. Journal
now ends at `idx 7`.

Verified post-migration:

```
column_name=features  data_type=jsonb  is_nullable=NO  column_default='{}'::jsonb
indexes on clients: clients_pkey, clients_slug_unique      (none added — as planned)
```

## Data Access / Server Actions Added or Changed

**`lib/content.ts` untouched. `lib/actions/**` untouched. No Server Action was
added or changed. Zero new database round trips.** Every one of the 22
substituted sites reads a field off a row it already had in hand.

Two read-side modules outside `lib/content.ts` changed:

- `lib/features.ts` — `featureEnabled(host, key)`, synchronous, pure. Guards in
  the plan's order: `!f` first (because `'null'::jsonb` is a valid NOT NULL
  value and `typeof null === "object"`), then `typeof f !== "object"`, then an
  `Object.hasOwn`-guarded read, then `typeof raw === "boolean"` — anything else
  is treated as absent and falls back to the documented default rather than
  being coerced.
- `lib/static-params.ts` — `activeTenants()` gains **one column in its
  projection** and **no change to its `WHERE`**. The `isActive` filter and the
  `TENANT_ONLY` narrowing are unchanged.

`lib/tenant.ts` is untouched: `lookupClientBySlug` already does `db.select()`
over all columns, so `features` arrives free.

## Routes Added or Changed

**None added, removed, renamed or re-parameterised.** Ten route files changed
argument shape only. All four `generateStaticParams` functions return the same
complete param sets (including the ancestor `tenant`) as before — proven by the
identical prerendered counts, not asserted.

Ownership of the two gSP shapes was preserved exactly as instructed:

- **home-loan** (`[slug]:29`, `[slug]/[amount]:16`) — now `homeLoanEnabled(tenant)`
  on the `StaticParamTenant`. These compile *only* because `lib/static-params.ts`
  was widened first.
- **vastu** (`[sector]:24`, `[sector]/[aspect]:30`) — **argument only**:
  `vastuSectorsEnabled(t.slug)` → `vastuSectorsEnabled(t)`. The
  `const t = await getTenantBySlug(tenant.slug)` re-resolution was **kept**
  (verified by grep at both files, lines 23 and 29), so CD-01's `isActive`
  guard and `templateKeyFor` validation still apply to the two largest
  prerendered families. The two shapes were **not** harmonised.

## Rendering and Caching

- **No page gained a `headers()` call.** Public pages still take the tenant from
  `params` via `getTenantBySlug`. Grep across the ten touched `(public)` files
  found one hit and it is a *comment* at `layout.tsx:32` explaining precisely
  that. `featureEnabled()` is a pure function over a value already in hand and
  reads no dynamic API.
- **Static/dynamic per route: unchanged for every route.** The observable proof
  is that the build prerendered the identical 9,659 pages and the identical
  per-tenant totals; a route forced dynamic would have dropped out.
- `export const revalidate = 300` on `(public)/layout.tsx` unchanged. Its
  `<Suspense>` boundary around `HeaderV2` unchanged — `toolLinksFor(tenant)` is
  still evaluated on the server before the boundary.
- **No cache key changed and none was added.** `lookupClientBySlug`'s
  `unstable_cache` key parts remain `["client-by-slug"]` + `slug`, and `slug`
  is still the only thing that varies the result. Traced: `features` is a
  column on the row that key already returns, not a new argument.
- **No new cached function anywhere.**
- **No `revalidatePath` / `revalidateTag` added — correctly, because this
  increment adds no write path.** CD-03 owns the toggle action and its
  revalidation. The lag window (300s `unstable_cache` compounding with the
  layout's `revalidate = 300`, ~10 minutes) is documented, not fixed; every
  toggle proof below used stop / `rm -rf .next` / SQL / restart rather than
  racing it.

## Per-Client Gating

The flags are per-client data; **the refactor is global**. Blast radius per
shared file:

| Shared file | Reaches |
|---|---|
| `app/site/[tenant]/(public)/layout.tsx` | **all six tenants** (layout for every public page; the changed calls are inside the `isPremiumV2` branch) |
| `components/realestate/premium-v2/FooterV2.tsx` | all five real-estate tenants, every page |
| `components/realestate/templates/PremiumV2Home.tsx` | all five, home page |
| `components/realestate/premium-v2/PremiumV2CalculatorsIndexPage.tsx` | all five, `/calculators` |
| `components/realestate/premium-v2/PremiumV2EmiCalculatorPage.tsx` | evergreen + expert (the other three are redirected to `/home-loan` by `calculators/[key]:63`) |
| `lib/premium-v2/tools.ts` | all five — header Tools menu, `/calculators` index, home tools section |

No component was changed for one client's benefit; every change is the same
mechanical parameter substitution for all of them, and the per-client answer
moved to data. **No new `Set<string>` of slugs was added anywhere.**
`lib/premium-v2/positioning.ts` (hero copy) was not touched — it is not a
boolean and CD-07 owns it.

## Content / YAML Changes

**No `clients/*/profile.yaml` file was edited. No YAML field was added or
changed. No `_status` value was added or changed. No client fact was invented
or guessed.** `pnpm check:content high-properties` still reports the
pre-existing `3 placeholder · 3 pending`, unchanged.

`_status` is not applicable here: it marks *claims about the business*, and
`clients.features` is deployment configuration in the same class as `slug`,
`vertical` and `template_key`, none of which carries one.

**The `profile.yaml` `features:` collision was guarded, not wired**, exactly as
ruled:

- `scripts/seed-client.ts` does **not** learn to write `clients.features`.
- The local at (formerly) line 109 is renamed `features` → `settingsFeatures`,
  with all five uses updated (`reviewsEnabled`, `pricingEnabled`,
  `awardsEnabled`, `clientLogosEnabled`, `teamEnabled`). `features` is now an
  unbound identifier in that file, so the wrong move cannot be made by
  autocomplete.
- A comment at the `clients` upsert states that `clients.features` is
  deliberately not seeded from YAML, that `profile.features` is the firm-settings
  booleans, and that a new tenant correctly receives `'{}'` = the documented
  defaults.

Regulatory:
- **RERA** — untouched. No listing surface changed; `PropertyCard` was not
  edited and the "registration pending" treatment is unaffected.
- **ICAI** — untouched. `reviewsEnabled` is not read by this increment and
  `arora-k-associates` keeps its `false`. None of the five flags applies to the
  `cafirm` vertical, which is why its row keeps `{}`.
- **DSA** — which tenant asserts the channel-partner claim is unchanged (three
  tenants, before and after). The *reason* the flag is opt-in survives in the
  rewritten comment in `lib/home-loan/enabled.ts`, which names CD-03's
  confirmation checkbox.

The four comment rewrites are deliverables and were treated as such — each
keeps its original reasoning (map section is a non-functional placeholder;
property-management art is High-Properties-branded; vastu is ~3,700 routes and
has already failed a deploy after 41 minutes; home-loan asserts a DSA
relationship), adds the new mechanism and its default polarity, and ends with a
line marking it as the source for CD-03's on-screen helper text.

## Commands Executed

```
rm -rf .next && pnpm build            (baseline)   exit 0
pnpm db:generate                                   → drizzle/0007_chubby_runaways.sql
pnpm db:migrate                                    → migrations applied successfully!
pnpm build                            (checklist)  exit 1  — deliberate, step 5
rm -rf .next && pnpm build            (green)      exit 0
pnpm check:content high-properties                 (before and after)
pnpm dev                                           (baseline, after, and 4 toggle cycles)
node --env-file=.env.local <scratchpad>/sql.mjs "<SQL>"   (evidence + toggle proofs)
```

`pnpm build` was run **three** times plus the one deliberate failing checklist
run. `pnpm dry-run` was **not** run — it is stale.

SQL was executed through a scratch runner in the session scratchpad
(`C:\Users\ashis\AppData\Local\Temp\claude\...\scratchpad\sql.mjs`) that
resolves the project's own `postgres` client. **It is not committed to the
repo**; there is no `psql` on this machine.

## Results

**There is no test suite.** `package.json` defines no `test`, `lint` or
`typecheck` script. Nothing below is a claim that tests passed; `pnpm build` is
the typecheck and everything else is observation.

### Build — before vs after

Baseline (clean tree) matched the hard gate **exactly**, so the regression
signal is trustworthy:

```
prerendered-before.txt              prerendered-after.txt
     42 arora-k-associates               42 arora-k-associates
    546 evergreen-real-estate           546 evergreen-real-estate
    547 expert-realtors                 547 expert-realtors
   5005 high-properties                5005 high-properties
   1071 nayra-realtors                 1071 nayra-realtors
   1071 urban-flat-real-estate         1071 urban-flat-real-estate

diff prerendered-before.txt prerendered-after.txt   → no output
```

Per-family, before and after, identical:

```
high-properties          home-loan=524   vastu-gurugram=3699  property-management=1
evergreen-real-estate    home-loan=0     vastu-gurugram=0     property-management=1
expert-realtors          home-loan=0     vastu-gurugram=0     property-management=1
nayra-realtors           home-loan=524   vastu-gurugram=0     property-management=1
urban-flat-real-estate   home-loan=524   vastu-gurugram=0     property-management=1

diff families-before.txt families-after.txt         → no output
```

Both builds: `✓ Compiled successfully`, `Finished TypeScript`,
`✓ Generating static pages using 15 workers (9659/9659)`. No Postgres `53300`
and no `53200` occurred.

**One correction to the plan's expectation, recorded so the verifier does not
read it as a regression.** The plan predicted `property-management=1` only for
`high-properties`. In fact the `.html` artefact is emitted for all five,
because a prerendered `notFound()` still writes a file — the *status* is in the
sibling `.meta`. That is true of the baseline and the after-build equally, so
the comparison is still valid; the sharper signal is the meta, which I captured
after the change:

```
high-properties          pm.meta status key absent   (= 200)
evergreen-real-estate    "status": 404
expert-realtors          "status": 404
nayra-realtors           "status": 404
urban-flat-real-estate   "status": 404
```

### Checklist build (step 5) — the type gate worked

The deliberate failing build produced **exactly 22 errors at exactly the 22
sites the plan enumerated, at the predicted line numbers**, all of the form
`TS2345: Argument of type 'string' is not assignable to parameter of type
'FeatureHost'`. Including both home-loan `generateStaticParams` gates
(`[slug]/page.tsx(29,26)` and `[slug]/[amount]/page.tsx(16,26)`) — which is the
direct proof that Risk 1 was closed by the widening rather than compiled into
silence. No gate was "fixed" by weakening a type; the projection was already
correct.

### Rendered pages — the full 5 × 6 matrix, before and after

`diff status-before.txt status-after.txt` → **no output**. Both runs:

| Route | high-properties | evergreen | expert | nayra | urban-flat |
|---|---|---|---|---|---|
| `/property-management` | **200** | 404 | 404 | 404 | 404 |
| `/home-loan` | **200** | 404 | 404 | **200** | **200** |
| `/vastu/gurugram` | **200** | 404 | 404 | 404 | 404 |
| `/vastu` (control) | 200 | 200 | 200 | 200 | 200 |
| `/calculators` (control) | 200 | 200 | 200 | 200 | 200 |
| home | 200 | 200 | 200 | 200 | 200 |

### Home-page composition and footer link — before and after

`diff composition-before.txt composition-after.txt` → **no output**.

```
high-properties          map=0 mgmt=2 homeloanlink=1
evergreen-real-estate    map=1 mgmt=0 homeloanlink=0
expert-realtors          map=1 mgmt=0 homeloanlink=0
nayra-realtors           map=1 mgmt=0 homeloanlink=1
urban-flat-real-estate   map=1 mgmt=0 homeloanlink=1
```

The map section is absent only on `high-properties` and the property-management
section present only on `high-properties` — the opt-out polarity survived.

### Sitemap — sorted URL-set identity (AC 8 as amended)

```
core         before=120    after=120    SET-MATCH
properties   before=1300   after=1300   SET-MATCH
register     before=308    after=308    SET-MATCH
localities   before=56     after=56     SET-MATCH
updates      before=18     after=18     SET-MATCH
services     before=20     after=20     SET-MATCH
```

All six families identical as sorted `<loc>` sets. (Byte identity was not the
bar — `sitemapClients()` has no `ORDER BY` and this migration wrote to every
real-estate row.)

### Database

Final six rows, after all toggle proofs and the restore:

```
arora-k-associates      cafirm      {}
evergreen-real-estate   realestate  map=true  pm_section=false pm_page=false vastu=false loan=false
expert-realtors         realestate  map=true  pm_section=false pm_page=false vastu=false loan=false
high-properties         realestate  map=false pm_section=true  pm_page=true  vastu=true  loan=true
nayra-realtors          realestate  map=true  pm_section=false pm_page=false vastu=false loan=true
urban-flat-real-estate  realestate  map=true  pm_section=false pm_page=false vastu=false loan=true
```

Exactly the plan's matrix. `urban-flat-real-estate`'s `homeLoan` is **restored
to `true`** — the mandatory restoration after Proof C.

### Toggle proofs (AC 10)

Guinea pig `urban-flat-real-estate` throughout. `high-properties` never
mutated. `vastuSectors` **never enabled on a second tenant**, not even briefly.
Every cycle was stop dev / `rm -rf .next` / SQL / restart, so no result raced
the cache window.

**Proof A — a page family turns on and off (`propertyManagementPage`)**

| Step | urban-flat `/property-management` |
|---|---|
| baseline (migration value) | 404 |
| `features \|\| '{"propertyManagementPage":true}'` + restart | **200** |
| `features \|\| '{"propertyManagementPage":false}'` + restart | **404** |

At the "on" step `high-properties` was re-probed and was unchanged
(`pm=200 loan=200 vastuG=200 map=0 mgmt=2`), and urban-flat's home page still
showed `mgmt=0` — the *section* flag stayed false while the *page* flag
flipped, which independently confirms the two flags are distinct.

**Proof B — the opt-out polarity is real (`propertyMap`)**

| Step | urban-flat home marker |
|---|---|
| baseline | `map=1` |
| `'{"propertyMap":false}'` + restart | **`map=0`** |
| restored to `true` + restart | **`map=1`** |

`evergreen-real-estate` was re-probed during the "off" step and still showed
`map=1` — the flip is per-tenant, not global.

**Proof C — `{}` is well-defined, not accidental (the CD-03 case)**

`UPDATE clients SET features = '{}'::jsonb WHERE slug = 'urban-flat-real-estate'`
+ restart:

```
urban-flat-real-estate   home=200 pm=404 loan=404 vastuG=404 | map=1 mgmt=0 loanlink=0
```

The map section is **present** (`propertyMap` defaults `true`) and all four
opt-in surfaces are **off**, including the footer "Home Loans" link. That is the
non-uniform defaults table observed, not asserted. The row was then restored to
its migration value and the restoration proven by both the final `select` above
and a re-probe of all five tenants matching the baseline matrix exactly.

### Content greps

```
five Set<string> allowlists remaining in repo ......... none
await/async on any gate or accessor .................. none
FooterV2 homeLoanEnabled/clientSlug .................. lines 35 (prop decl), 38 (destructure), 68 (use)
                                                       — no import, no clientSlug anywhere
"use client" file importing a gate or lib/features .... none
lib/features.ts import count ......................... 0
AGENTS.md "toggles currently live in code" ........... none
proxy.ts / lib/content.ts / lib/actions/ status ...... clean (untouched)
```

Two files surfaced by the plan's broad `grep -rl` (`CalculatorsV2.tsx`,
`HeaderV2.tsx`) are the known false positives and were re-verified: each
mentions `lib/premium-v2/tools.ts` only inside a doc comment (lines 19 and 88
respectively) and neither has an `import` of it. A precise check for an actual
`import ... from "@/lib/{features,home-loan/enabled,vastu/enabled,premium-v2/…}"`
in any `"use client"` file returned nothing.

## Pre-Flight Self-Review

1. **Tenant scoping** — PASS. No query was added, removed or re-predicated.
   `activeTenants()` gained one column and no `WHERE` change; `lookupClientBySlug`
   and `sitemapClients()` are untouched. `clients` *is* the tenant registry, so
   `clientId` scoping does not apply to it, and not one `lib/content.ts` query
   changed. This is a small strengthening: the old helpers took a bare `string`
   and would answer for any slug handed in; the answer can now only come from
   the row being rendered. No Server Action added, so no new ownership check
   was required.
2. **Public pages stay static** — PASS. No `headers()` and no `getTenant()`
   introduced anywhere; the single grep hit is a comment at `layout.tsx:32`.
   Observationally confirmed: the after-build prerendered the identical 9,659
   pages and identical per-tenant totals, which a dynamic-forced route would
   have broken.
3. **`generateStaticParams` returns the complete param set** — PASS.
   `paramsForEachTenant` still spreads `{ tenant: tenant.slug, ...row }`; only
   the *type* of the object handed to the callback widened. Confirmed
   prerendered in the build output: `high-properties` 5,005 (incl. 3,699 vastu
   sector routes) and 524 home-loan routes on each of the three DSA tenants —
   all unchanged.
4. **Cache keys vary with every argument** — PASS. No cache key changed and no
   cached function was added. `lookupClientBySlug` keys on `["client-by-slug"]`
   + `slug`; `features` is a column on the row that key already returned, not a
   new varying argument, so there is nothing new to key on.
5. **Links survive host mode** — PASS. No link was authored or altered; the
   `/realestate/temp-premium-v2/<slug>` prefix appears nowhere in `app`,
   `components` or `lib` except one pre-existing comment in `lib/domains.ts`
   (untouched). `FooterV2` still builds every href through `joinPath(basePath, …)`.
6. **Blast radius across tenants** — PASS, and named above per file. Six shared
   files were edited; every edit is the same mechanical parameter substitution
   justified for all five tenants, not a change made for one. No new
   slug-keyed switch was introduced.
7. **Config agrees with code** — N/A, PASS. No `next/image` `quality` value was
   added, so `next.config.ts` → `images.qualities` needs nothing; no new
   disk-read asset, so `outputFileTracingIncludes` needs nothing.
   `next.config.ts` is unmodified.
8. **No invented client facts** — PASS. No YAML file touched, no field added,
   no `_status` changed. `pnpm check:content high-properties` still reports the
   same `3 placeholder · 3 pending`. The flag values were copied out of the four
   source files, not decided.
9. **Client-render purity** — PASS for this diff. `FooterV2` gained a boolean
   prop and *lost* a function call; it has no `Date.now()`, `new Date()` or
   `Math.random()` added. **Pre-existing observation, out of scope, reported not
   fixed:** `FooterV2.tsx:243` (line 239 in `HEAD`, i.e. present before this
   increment) renders `© {new Date().getFullYear()}` during render in a
   `"use client"` component. That is the hydration-mismatch defect class,
   already in the committed tree, untouched by my diff, and outside CD-02's
   approved scope — flagging it for a future work item rather than widening
   this one.
10. **Scope discipline** — PASS. `git status --porcelain` cannot isolate this
    increment because CD-00 and CD-01 are complete but uncommitted, so I used
    the required comparison instead:
    `diff <(sort work/CD-02-feature-flags/pre-state.txt) <(git status --porcelain | sort)`.
    It reports **14 added entries and zero removed**:

    ```
    >  M app/site/[tenant]/(public)/home-loan/[slug]/[amount]/page.tsx
    >  M app/site/[tenant]/(public)/home-loan/[slug]/page.tsx
    >  M app/site/[tenant]/(public)/home-loan/page.tsx
    >  M components/realestate/premium-v2/FooterV2.tsx
    >  M components/realestate/premium-v2/PremiumV2CalculatorsIndexPage.tsx
    >  M components/realestate/premium-v2/PremiumV2EmiCalculatorPage.tsx
    >  M components/realestate/templates/PremiumV2Home.tsx
    >  M lib/home-loan/enabled.ts
    >  M lib/premium-v2/home-sections.ts
    >  M lib/premium-v2/tools.ts
    >  M lib/vastu/enabled.ts
    >  ?? drizzle/0007_chubby_runaways.sql
    >  ?? drizzle/meta/0007_snapshot.json
    >  ?? lib/features.ts
    ```

    Every one is on the plan's Expected Files list. The remaining CD-02 files
    (`layout.tsx`, `calculators/[key]`, `property-management`, the four vastu
    pages, `lib/sitemap.ts`, `lib/static-params.ts`, `lib/db/schema.ts`,
    `drizzle/meta/_journal.json`, `AGENTS.md`, `scripts/seed-client.ts`) were
    already ` M` in `pre-state.txt` from CD-00/CD-01 and so do not appear as
    added lines — they are on the Expected Files list too. **Nothing outside
    the approved scope was touched**, and the plan's exclusions hold: `proxy.ts`,
    `lib/content.ts`, `lib/actions/**`, `lib/tenant.ts`, `lib/domains.ts`,
    `lib/templates/index.ts`, `lib/premium-v2/positioning.ts`, `README.md`,
    `clients/*/profile.yaml` and `next.config.ts` all carry no change of mine.

    *Caveat for the verifier:* `git diff --stat` on the CD-02 file set shows
    cumulative CD-00/CD-01 + CD-02 line counts for files all three touched
    (notably `AGENTS.md +216`, `lib/db/schema.ts +40`, `lib/static-params.ts +45`,
    `scripts/seed-client.ts +59`). Those totals are **not** CD-02's diff alone.

## Acceptance Criteria

**AC 1 — `clients.features` jsonb, non-null, default `{}`, backfilled exactly.
PASS.**
*Code:* `lib/db/schema.ts` → `features: jsonb("features").$type<ClientFeatures>().notNull().default({})`;
`drizzle/0007_chubby_runaways.sql` = generated `ALTER` + three-statement backfill.
*Observed:* `information_schema` → `jsonb | NO | '{}'::jsonb`; the six-row
`features->>` matrix reproduces the plan's table exactly, `arora-k-associates`
`{}`; `pg_indexes` shows only `clients_pkey` and `clients_slug_unique`.

**AC 2 — no helper async, no call site awaits, `FooterV2` takes a prop and
performs no lookup. PASS.**
*Code:* all five delegates and `featureEnabled` are plain `export function`;
`FooterV2Props.homeLoanEnabled: boolean` with the `@/lib/home-loan/enabled`
import deleted and `clientSlug` removed.
*Observed:* `pnpm build` green (an `await`-less `Promise<boolean>` in these
`if`s would not typecheck); grep for `await <gate>` / `async function
featureEnabled` / `export async function .*Enabled` → no output; `FooterV2`
grep → only lines 35/38/68, no import, no `clientSlug`; no `"use client"` file
imports a gate or the accessor.

**AC 3 — build green and per-tenant prerendered counts match baseline. PASS.**
*Code:* `StaticParamTenant` + `activeTenants()` widened before either home-loan
gate was touched; `FeatureHost.features` required, not optional.
*Observed:* both `diff prerendered-*` and `diff families-*` produce **no
output**; 9,659 pages both builds; the checklist build proved the two gSP gates
were type-checked rather than silently defaulted.

**AC 4 — home-page composition unchanged for all five. PASS.**
*Code:* `PremiumV2Home.tsx:166,186` now read the row.
*Observed:* `diff composition-before.txt composition-after.txt` → no output;
`high-properties` `map=0 mgmt=2`, the other four `map=1 mgmt=0`.

**AC 5 — `/property-management` 200 on high-properties, 404 on the other four.
PASS.**
*Code:* `propertyManagementPageEnabled(tenant)` at `property-management/page.tsx:27,53`.
*Observed:* status matrix row 1, identical before and after; corroborated by
the prerender `.meta` statuses (404 on four, 200 on one).

**AC 6 — `/home-loan` 200 on three, 404 on two. PASS.**
*Code:* `homeLoanEnabled(tenant)` at five page sites incl. both gSP gates.
*Observed:* status matrix row 2 — 200 on `high-properties`, `nayra-realtors`,
`urban-flat-real-estate`; 404 on `evergreen-real-estate`, `expert-realtors`.
Reinforced by `home-loan=524 / 0` per-family prerender counts.

**AC 7 — `/vastu/gurugram` 200 only on high-properties; base `/vastu` available
to all five. PASS.**
*Code:* `vastuSectorsEnabled` at six sites, with the two gSP re-resolutions kept.
*Observed:* status matrix rows 3 and 4 — `/vastu/gurugram` 200 / 404×4;
`/vastu` 200 on all five. `vastu-gurugram=3699` prerendered only for
`high-properties`.

**AC 8 (as amended: sorted URL-set identity) — PASS.**
*Code:* `lib/sitemap.ts:138,141,160,222` changed argument shape only; no output
logic touched.
*Observed:* all six families `SET-MATCH` with identical counts
(120 / 1300 / 308 / 56 / 18 / 20).

**AC 9 — footer "Home Loans" link on exactly three tenants. PASS.**
*Code:* `(public)/layout.tsx:197` computes `homeLoanEnabled(tenant)` on the
server and passes it as a prop.
*Observed:* `homeloanlink=1` on `high-properties`, `nayra-realtors`,
`urban-flat-real-estate`; `0` on `evergreen-real-estate`, `expert-realtors`;
identical before and after; and it went to `0` on urban-flat under Proof C,
proving the prop is genuinely driven by the row.

**AC 10 — a database flip changes rendered output with no code change. PASS.**
*Observed:* Proofs A, B and C above — a page family turned 404→200→404, a home
section turned present→absent→present, and `{}` produced the documented
non-uniform defaults. No file was edited during any of it.

## Architecture Plan Compliance

Full. The 13-step Implementation Sequence was worked in order:

- Step 1 baseline captured on the clean tree and **matched the hard gate
  exactly** (42 / 546 / 547 / 5005 / 1071 / 1071), so no escalation was needed.
- Step 3 (projection widening) landed before step 6 (home-loan gates). The
  checklist build at step 5 confirmed the gates broke on the *argument type*,
  not on a missing `features` property.
- Step 7 changed the vastu gSP argument only; both `getTenantBySlug`
  re-resolutions are intact.
- `FeatureHost.features` is **required**, per Architecture Conflict 2. It was
  not relaxed.
- The seed-script rename + comment landed; **no seed write and no YAML key**,
  per Open Decisions 1 and 2.
- All five keys written explicitly on all five rows, per Open Decision 3.
- `featureEnabled` returns the documented default for a null host, per Open
  Decision 4.
- Conditions honoured: `vastuSectors` never enabled on a second tenant;
  `high-properties` never mutated; Proof C's `homeLoan` restoration proven by
  the final `select`.

## Deviations

**None from the plan.** Two observations where reality differed from a stated
*expectation* (not from an instruction), both recorded above rather than
absorbed silently:

1. The plan's per-family baseline expected `property-management=1` only for
   `high-properties`. The `.html` artefact is in fact emitted for all five,
   because a prerendered `notFound()` still writes a file; the status lives in
   the sibling `.meta`. Identical before and after, so the comparison stands,
   and I captured the `.meta` statuses as the sharper signal.
2. The plan's broad `grep -rl` for `"use client"` consumers surfaces
   `CalculatorsV2.tsx` and `HeaderV2.tsx`, which the plan itself had already
   cleared as false positives (comment mentions, not imports). Re-verified.

## Known Limitations

- **The 300s cache window is documented, not closed.** A flag flipped directly
  in SQL is invisible for up to ~10 minutes in a running deployment
  (`unstable_cache` 300s compounding with the layout's `revalidate = 300`).
  CD-03 owns the revalidation. All evidence here used `rm -rf .next` + restart
  to be deterministic.
- **Deploy ordering is mandatory and unenforced by code.** Migrate *before* the
  new code serves traffic. New code against a pre-migration database fails
  loudly (`42703 column "features" does not exist`), but a cache entry written
  by pre-change code and read by post-change code yields defaults and serves
  the **wrong sections without an error** for up to 300s. A new deployment id
  invalidates Next's data cache in production, which closes the window in
  practice, but the ordering is still required.
- **No write path exists yet.** These are operator-editable by SQL only until
  CD-03. Recorded for CD-03: `clients.features` belongs on the **platform**
  dashboard, not the tenant dashboard — `homeLoan` asserts a DSA relationship
  the operator must verify, and `vastuSectors` can fail the deployment for
  every other tenant on it.
- **Pre-existing, out of scope:** `FooterV2.tsx:243` computes
  `new Date().getFullYear()` during render in a `"use client"` component
  (present in `HEAD`, untouched here). Hydration-mismatch class; worth a future
  work item.
- The generated `drizzle/meta/0007_snapshot.json` is machine-written and was
  not reviewed line by line, in line with existing practice.

## Blockers

None.

---

**State left behind:** a `next dev` server is running on `localhost:3000`
(matching how the machine was found), `.next` holds a dev build, and the
database is in the exact six-row state of the migration matrix, proven by the
final `select` above. `current-status.md` was **not** touched — the manager
updates it after independent verification.

---

# Defect Cycle 1

Two findings from `/code-review high`, both the same defect class: **a stated
guarantee the code does not deliver.** Both fixed. The two findings recorded as
standing (`lib/verticals/realestate.ts:56` nav, `lib/sitemap.ts:103`
`sitemapClients()`) were **not touched**, as directed.

## Fix 1 — `lib/tenant.ts`, the `isActive` comment overstated its reach

**Scope note:** `lib/tenant.ts` is on the architecture plan's *Explicitly NOT
touched* list, and it is modified in the working tree by CD-01, not by me — so
"already in your diff" is true of `scripts/seed-client.ts` but not of this file.
I edited it on the coordinator's explicit direction. The change is
**comment-only**: this cycle's diff of that file contains no executable line.
**No enforcement was implemented** — the Server Action gap stays deferred to
CD-03.

The old wording claimed the guard was "the enforcement point for both the public
tree and the tenant dashboard, because both resolve through here." True of
rendered pages, false of Server Actions.

**Verified before writing the replacement** (I did not take the finding on
trust):

| Claim | Check | Result |
|---|---|---|
| Public pages resolve through `getTenantBySlug` | `grep -rln` in `(public)` | **41 files** |
| Dashboard pages likewise | `dashboard/layout.tsx:21-22` | `getTenantBySlug` then `notFound()` |
| Login page is covered | no `dashboard/login/layout.tsx` exists | nests under the gated layout |
| `auth-actions.ts:30` has no `isActive` | read | `.where(eq(clients.slug, tenantSlug))` only |
| `lib/auth.ts:86-87` has no `isActive` | read | `.where(eq(clients.slug, tenantSlug))` only |
| `submit-query.ts:53,58-59` has no `isActive` | read | slug / customDomain only |
| `getTenant()` has no `isActive` | `grep -c` in its body | **0** |

The replacement states the covered set (every *rendered* surface, naming the two
resolution paths), then states plainly that Server Actions are **not** gated
here — naming all three files — that a deactivated tenant's staff can still sign
in and run every mutating dashboard action and that lead submission still writes
rows, that `getTenant()` does not apply the guard either, and that **CD-03 owns
closing it**.

**One correction I made beyond the brief, in the direction the brief intends.**
The proposed wording was "every rendered surface … both of which resolve through
`getTenantBySlug`". My check found **one exception**:
`app/site/[tenant]/(public)/properties/loading.tsx` reads `getTenant()`, so its
shell renders before this guard runs. Since the whole point of this fix is that
a comment must not claim coverage the code lacks, replacing one overstatement
with a slightly smaller one would have missed the point. The comment now names
that exception explicitly as CD-01's standing soft-404 finding, unfixed, owned
by CD-03. **I did not fix `loading.tsx`** — it is a standing finding and out of
scope.

**Read back against the code** (report requirement): the comment sits directly
above `if (!row.isActive) return null;` and contradicts nothing in the file.
Every file, symbol and line it references was confirmed by the table above.

## Fix 2 — `scripts/seed-client.ts`, the template validation hole

A `realestate` `profile.yaml` with **no** `template:` key passed validation,
seeded, exited 0, and produced a site whose every page `getTenantBySlug` 404s —
the silent dead-site outcome the CD-01 block exists to prevent. All five live
profiles carry the key, so nothing live was affected; the documented onboarding
path was.

**One code path, reused**, as directed — the same block, the same registry
lookup, the same message shape and the same "Nothing was written." ending. The
condition became two named booleans rather than a nested ternary, because the
single-expression form was unreadable:

```ts
const missingForRealestate = vertical === "realestate" && templateKey === null;
const unrecognised = templateKey !== null && !Object.hasOwn(TEMPLATE_REGISTRY, templateKey);
if (missingForRealestate || unrecognised) { …one throw… }
```

Three judgement calls, all recorded in the comment:

1. **Empty/whitespace-only counts as missing**, so `template: ''` is caught.
2. **A non-empty value is NOT trimmed** before the registry lookup — deliberately,
   so `"premium-v2 "` still fails as *unrecognised* rather than being quietly
   repaired into validity. The original comment names a stray trailing space as
   a typo to reject, and that strictness is preserved.
3. **`cafirm` with no template stays valid.** The check is predicated on the
   vertical, not on the key merely being present — null is the correct answer
   for that vertical, not an omission.

Also folded in: the upsert's two `vertical: profile.vertical ?? "cafirm"`
expressions now read the same `vertical` const the validation gates on, so the
check and the write cannot diverge on which vertical a profile is.

## Evidence

### Negative cases — the fix

Harness: `clients/urban-flat-real-estate/profile.yaml`, backed up first.

| Case | YAML | Exit | Message |
|---|---|---|---|
| A | `template:` line **removed** | **1** | `sets vertical: "realestate" but names no template, which is not a template this codebase can render. Valid keys: premium-v2. Nothing was written.` |
| B | `template: ''` | **1** | same |
| C (control) | `template: premiumv2` | **1** | `sets template: "premiumv2", which is not a template … Nothing was written.` |

Case C is the regression control: the pre-existing invalid-value rejection still
fires with its original message.

**Nothing written**, confirmed after all three:

```
select count(*) from clients                    -> 6      (unchanged)
urban-flat-real-estate row -> vertical=realestate template_key=premium-v2
                              features={"homeLoan":true,"propertyMap":true,...}   (untouched)
```

### Positive cases — the fix did not over-reject

| Case | Profile | Exit | Output |
|---|---|---|---|
| realestate **with** a valid template | `urban-flat-real-estate` | **0** | `client … / settings ok / user already exists / Seeded` |
| **cafirm with no template at all** | `arora-k-associates` (`vertical: cafirm`, no `template:` key) | **0** | `client … / settings ok / user already exists / Seeded` |

The cafirm case is the one that would break if the check were predicated on the
key rather than the vertical. It passes.

**Bonus confirmation of a CD-02 claim, now observed rather than argued:** the
full re-seed of `urban-flat-real-estate` left its `features` value completely
intact (`homeLoan:true, propertyMap:true`, three false). That is live proof of
the seed-upsert comment's assertion that "re-seeding an existing client cannot
null out a live flag."

### Restoration

`diff <backup> clients/urban-flat-real-estate/profile.yaml` → **identical**. The
YAML is byte-restored; the test edits left no trace.

Final six-row state, after every negative and positive case:

```
arora-k-associates      cafirm      template_key=null        features={}
evergreen-real-estate   realestate  premium-v2  map=true  pm_sec=false pm_pg=false vastu=false loan=false
expert-realtors         realestate  premium-v2  map=true  pm_sec=false pm_pg=false vastu=false loan=false
high-properties         realestate  premium-v2  map=false pm_sec=true  pm_pg=true  vastu=true  loan=true
nayra-realtors          realestate  premium-v2  map=true  pm_sec=false pm_pg=false vastu=false loan=true
urban-flat-real-estate  realestate  premium-v2  map=true  pm_sec=false pm_pg=false vastu=false loan=true
```

Exactly the migration matrix. Unchanged from the end of the main increment.

### Build

`rm -rf .next && pnpm build` → **exit 0**. `Compiled successfully in 8.9s`,
`Finished TypeScript in 10.5s`, `Generating static pages using 15 workers
(9659/9659) in 120s`. No `53200`, no `53300`, so no retry and no escalation.

I agreed that neither change can move a route — a comment cannot, and the seed
script does not run at build time — so no rebuild-based regression evidence was
required. `.next` was populated anyway, so the per-tenant counts came free and
are reported for completeness: **identical**.

```
diff prerendered-after.txt prerendered-defect1.txt   -> no output

     42 arora-k-associates
    546 evergreen-real-estate
    547 expert-realtors
   5005 high-properties
   1071 nayra-realtors
   1071 urban-flat-real-estate
```

### Scope

`diff <(sort pre-state.txt) <(git status --porcelain | sort)` still reports the
**same 14 added entries and zero removed** as at the end of the main increment.
Both files edited in this cycle (`lib/tenant.ts`, `scripts/seed-client.ts`) were
already ` M` in `pre-state.txt` from CD-00/CD-01, so no new entry appeared. **No
third file was touched.** `current-status.md` was not touched.

## Not fixed, as directed

- `lib/verticals/realestate.ts:56` — nav links "Property Management"
  unconditionally while the page 404s for four of five tenants. Recorded, not
  fixed; `lib/verticals/**` is excluded by the plan and it predates CD-02.
- `lib/sitemap.ts:103` — `sitemapClients()` filters only on `isActive`.
  Recorded, not fixed; CD-03 owns it and it needs a decision about what a
  sitemap should do with an incompletely configured tenant.
- `lib/tenant.ts` Server Action `isActive` enforcement — **deliberately not
  implemented.** Only the comment changed.
- `FooterV2.tsx`'s `new Date().getFullYear()` — pre-existing at line 239 in
  `HEAD`, left alone.
- `(public)/properties/loading.tsx`'s `getTenant()` — CD-01 standing finding,
  now *named* in the `lib/tenant.ts` comment but not fixed.

---

# Defect Cycle 2

The verifier was right and I should have caught both of these myself. I applied
the "does the comment match the code" standard to `lib/tenant.ts` — where I
refused the coordinator's wording and named the `loading.tsx` exception — and
then failed to apply it to comments I wrote in the same increment. Neither false
statement is in `HEAD`; both were introduced by CD-02.

Comment-only cycle. **No executable line changed in either file**, so no
rebuild, no database work and no re-run of any sweep — every result above
stands.

## Fix 1 — the false sitemap clause

`lib/premium-v2/home-sections.ts`, on `propertyManagementPageEnabled`. Removed:

> ~~and the route drops out of that tenant's sitemap.~~

The comment now ends at the true and useful statement:

```
 * Gate: `clients.features.propertyManagementPage`, default **false**. Off,
 * `/property-management` is a real 404 for that tenant rather than an empty
 * page.
```

**I did not add the route to the sitemap.** That would change output AC 8
freezes, and the absence is the verifier's separately recorded pre-existing
observation, not mine to act on.

| Claim | Checked against | Result |
|---|---|---|
| `/property-management` is in some tenant's sitemap | `grep -n property-management lib/sitemap.ts` | **no match** — the route is never emitted |
| …at least for `high-properties`, where the flag is on | captured live `core` sitemap `<loc>` set | **0 occurrences** |
| Off ⇒ a *real* 404, not a soft 200 shell | `ls (public)/property-management/loading.tsx` | **absent** ⇒ real 404. Claim stands |

## Fix 2 — the false call-site clause

Same file, the header. The old text said the three helpers "are called inline in
JSX and from `lib/sitemap.ts`". The second half is false, and it is false in a
way that would have propagated: `lib/sitemap.ts` imports only `homeLoanEnabled`
and `vastuSectorsEnabled`, both from sibling modules.

Replaced with the actual call sites, and an explicit negative so the next reader
does not have to re-derive it:

```
 * signatures — two of them are evaluated inline in `PremiumV2Home`'s JSX, and
 * the third gates `(public)/property-management`'s `generateMetadata` and its
 * page body — and take the tenant row instead of a slug, …
 *
 * Unlike the two sibling gate modules, nothing in this file is read by
 * `lib/sitemap.ts` or by any `generateStaticParams`.
```

| Claim | Checked against | Result |
|---|---|---|
| Complete call-site set for the three helpers | `grep -rn` over `app components lib` | exactly **4 sites**, no others |
| "two of them inline in `PremiumV2Home`'s JSX" | `PremiumV2Home.tsx:166, :186` | both are `{xEnabled(tenant) ? (` — inline JSX ✓ |
| "the third gates `generateMetadata` and the page body" | `property-management/page.tsx:27, :53` | 27 sits inside `generateMetadata` (declared line 24, `return {}`); 53 inside `PropertyManagementPage` (declared 46) ✓ |
| "nothing here is read by `lib/sitemap.ts`" | `grep -n Enabled lib/sitemap.ts` | only `homeLoanEnabled` (138, 160) and `vastuSectorsEnabled` (141, 222) ✓ |
| "…or by any `generateStaticParams`" | the 4-site set above | none is in a gSP ✓ |

**The sibling headers make the same claim correctly for themselves, so I left
them alone**, as instructed — verified rather than assumed:

- `lib/vastu/enabled.ts`: "called from `generateStaticParams` and from
  `lib/sitemap.ts`" → gSP at `vastu/gurugram/[sector]/page.tsx:24` and
  `[aspect]/page.tsx:30`; sitemap at `lib/sitemap.ts:141, 222`. **True.**
- `lib/home-loan/enabled.ts`: "called from `generateStaticParams`, from
  `lib/sitemap.ts` and inline in JSX" → gSP at `home-loan/[slug]/page.tsx:29`
  and `[slug]/[amount]/page.tsx:16`; sitemap at `138, 160`; inline JSX at
  `(public)/layout.tsx:198`, `homeLoanEnabled={homeLoanEnabled(tenant)}`.
  **All three true.**

## The third one — found, fixed, and flagged for your veto

You told me to assume there was a third rather than assume there wasn't. There
was, in `lib/vastu/enabled.ts`, and it is a different shape: **not false, but
operationally misleading.**

I had written that turning the flag on "for a **fourth** tenant" is on
`docs/client-dashboard-brief.md` §11's list. As a *citation* that is exact — §11
line 7 reads "enabling `vastuSectors` for a 4th tenant (this has already failed
a deploy)". But `select count(*) … where features->>'vastuSectors' = 'true'`
returns **1**. The "4th tenant" wording is a stale artifact of the period when
three tenants carried the matrix.

Left alone, an operator reading that comment — or CD-03's helper text lifted
from it — would reasonably conclude that enabling tenants two and three is
unrestricted. That is the opposite of the intent, and it is precisely the
"stated guarantee the code does not deliver" class, one step removed.

The fix keeps the citation intact and adds the count:

```
 * turning it on for another tenant is on `docs/client-dashboard-brief.md`
 * §11's list of decisions no agent may make alone, …
 *
 * §11 words that entry as "a 4th tenant", which dates from when three tenants
 * carried the matrix. Exactly ONE does today (`high-properties`). Read it as
 * "one more than now": the build-output cost lands on each tenant added, not
 * only on a particular ordinal.
```

**Flagging it explicitly because it exceeds "delete the two false clauses".** It
adds text rather than removing it, and it comments on a doc I did not edit. I
judged that leaving a technically-accurate-but-misleading operational
instruction in the exact comment CD-03 will lift was the worse outcome. If you
disagree, the paragraph is self-contained and deletes cleanly, and reverting the
one word "another" to "a fourth" restores the original. **`docs/client-dashboard-brief.md`
was not edited** — §11's stale wording is a separate call and yours to make.

## Remaining claims re-checked, since two got through

Every other claim I introduced in this increment, checked against the code
rather than against my memory of writing it:

| Claim | Where | Verified |
|---|---|---|
| `propertyMap` default **true** | `FEATURE_DEFAULTS` | `lib/features.ts:36` ✓ |
| "four of the five live tenants want it" | header + accessor comment | `map_on=4`, `realestate_rows=5` ✓ |
| `propertyManagementSection` / `Page` default **false** | accessor comments | `lib/features.ts:37, 38` ✓ |
| `vastuSectors` / `homeLoan` default **false** | accessor comments | `lib/features.ts:39, 40` ✓ |
| "~3,700 prerendered routes per tenant" | `vastu/enabled.ts` | measured `vastu-gurugram=3699` ✓ |
| "base vastu pages stay available to every real-estate tenant" | `vastu/enabled.ts` | `/vastu` = 200 on all five in the status matrix ✓ |
| three DSA tenants named by slug | `home-loan/enabled.ts` | matches the six-row `select` ✓ |
| "re-seeding cannot null out a live flag" | `seed-client.ts` upsert comment | observed live in Defect Cycle 1's re-seed ✓ |
| polarity: `propertyMap` opt-out, other four opt-in | header | `FEATURE_DEFAULTS` ✓ |

Statements about **future** increments — CD-03's confirmation checkbox, its hard
cap, its platform-dashboard placement — are intent carried from the approved
plan and the brief, not claims about current code, and are worded as such.

Items 1 and 2 are the only false statements found. The third is the only
misleading one.

## Scope

Two files, both already in my diff: `lib/premium-v2/home-sections.ts` and
`lib/vastu/enabled.ts`. `diff <(sort pre-state.txt) <(git status --porcelain |
sort)` still reports the **same 14 added entries, zero removed**. No new file.
`docs/client-dashboard-brief.md`, `lib/sitemap.ts` and the two sibling headers
were **not** touched. `current-status.md` was not touched.

No rebuild was run and none was needed: a comment cannot move a route, cannot
change a status code and cannot alter a sitemap. Every build, sweep, toggle
proof and database result reported above remains valid.
