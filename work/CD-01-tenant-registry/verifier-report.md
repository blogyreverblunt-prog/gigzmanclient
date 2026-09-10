# VERIFICATION REPORT

## Work Item

CD-01 — Tenant registry moves from code to the database.

Independent verification. I did not write this code. Every result below traces
to a command I ran myself or a URL I requested myself; the coder's report and
its `prerendered-after.json` were treated as claims to be re-derived, not as
evidence.

## Verdict

VERIFY_PASS

## Acceptance Criteria Coverage

| AC | Evidence | Status | Detail |
|---|---|---|---|
| 1. `template_key` exists, nullable, five backfilled | My own query against `localhost:5432/gigzman_client_sites` via the project's `postgres` client | **PASS** | `information_schema`: `character varying(60)`, `is_nullable=YES`, `column_default=null`. Six rows: five realestate = `premium-v2`, `arora-k-associates` = NULL, all `is_active=true`. `pg_indexes` shows only `clients_pkey` + `clients_slug_unique` — no index added, as the plan required. |
| 2. `CLIENT_SLUG_TEMPLATE_MAP` gone everywhere | `grep -rn "CLIENT_SLUG_TEMPLATE_MAP\|getTemplateKeyForSlug\|getTemplateUrlSlugForClientSlug" --include=*.ts --include=*.tsx .` | **PASS** | No output. Only surviving mention repo-wide is `docs/client-dashboard-brief.md:84`, a historical brief that is not edited. |
| 3. Accessor synchronous; no call site async; no Client Component lookup | Two greps + `pnpm build` reaching `Finished TypeScript in 9.1s` | **PASS** | `templateKeyFor` is `export function` (no `async`). No `"use client"` file imports it. No `await templateKeyFor`. The build's TypeScript phase completing is the proof that no call site became a floating Promise. |
| 4. Build green; per-tenant prerendered counts match baseline | **My own `pnpm build` from `rm -rf .next`**, then both derivation methods | **PASS** | See *Results*. `diff prerendered-before.json <my derivation>` → no output. |
| 5. Four routes per tenant: same status, same template | My own six-tenant × four-route curl sweep + `data-template` / `data-vertical` / `gp-container` | **PASS** | See *Tenant Sweep*. Matches the coder's before-baseline exactly. |
| 6. `template_key` null (or unrecognised) realestate row 404s | My own AC-6 cycle on `urban-flat-real-estate`, full stop / `rm -rf .next` / SQL / restart per step | **PASS** | `premium-v3` → 404; `null` → 404; restored `premium-v2` → 200. |
| 7. `is_active=false` → 404 + out of sitemap; reversible | My own AC-7 cycle, same discipline | **PASS** | off → home 404, `core.xml` hits 0; on → home 200, `core.xml` hits 20. |
| 8. `proxy.ts` has no database import | `git status --porcelain proxy.ts`, `git diff --stat proxy.ts`, `git hash-object`, read of its import list | **PASS** | No diff, no status entry. Hash `fdfccc96085a15092450f779a9afd98520f549e6`, matching the coder's pre-edit capture. Its five imports are `next/server` ×2, `./lib/verticals`, `./lib/templates`, `./lib/domains` — no DB path. `lib/templates/index.ts` declares `templateKeyFor`/`getTenantPath` parameters structurally, so it never reaches `lib/db/schema` even as an erased type import. |
| 9. Both rewritten comments state current reasoning and contradict nothing | Read-back plus a claim-by-claim check of each assertion against the code | **PASS** | See *Correctness Review → Content integrity*. |

## Architecture "Evidence Required" Coverage

| Plan item | Covered by | Status |
|---|---|---|
| Baseline `pnpm build` + prerendered summary | `build-before.txt` (`EXIT=0`) + `prerendered-before.json`, captured on the clean tree before any edit | covered (coder artifact; used only as the *before* side — the *after* side I re-derived myself) |
| After `pnpm build` + prerendered summary | **My own build**, `EXIT=0`, `9659/9659` in 103s | covered — re-derived, not accepted |
| `diff before/after` → empty | My derivation vs `prerendered-before.json` | covered — no output |
| Database rows after migration | My own query | covered |
| `\d clients` shows nullable varchar(60) | `information_schema.columns` query | covered |
| Rendered pages, ≥ `high-properties` + `arora-k-associates`, 4 routes | My six-tenant sweep (all six, not just two) | covered |
| `data-template` present/absent check | My curl + grep | covered |
| Identifying element (`gp-container`) | My curl + grep | covered, with one wording correction (NB-3) |
| Sitemap byte-equality across six families | I recomputed sorted `<loc>` digests for all six of the coder's before/after captures, **and** diffed my own live `core.xml` against the coder's after-capture | covered |
| Negative cases before/after equality | My curl with `%{redirect_url}` | covered |
| AC 6 cycle incl. fail-closed `premium-v3` | My own cycle | covered — re-run, not accepted |
| AC 7 cycle both directions | My own cycle | covered — re-run, not accepted |
| AC-2 / AC-3 / AC-9 greps | Run by me | covered |
| `^template:` in `clients/*/profile.yaml` = 5, none under arora | `git diff -- clients/` shows exactly five one-line additions | covered |
| Seeding round-trip + validation | **I executed the seed script** against a scratch `cwd` with three invalid `template:` values | covered — see *Edge Cases* |

## Evidence Collected

**Database.** Queried through the project's own `postgres` client (there is no
`psql` binary on this machine; scratch script lives in the session scratchpad,
not in the repo).

```
 arora-k-associates     | cafirm     | null         | true
 evergreen-real-estate  | realestate | premium-v2   | true
 expert-realtors        | realestate | premium-v2   | true
 high-properties        | realestate | premium-v2   | true
 nayra-realtors         | realestate | premium-v2   | true
 urban-flat-real-estate | realestate | premium-v2   | true

DDL:     template_key | character varying | 60 | is_nullable=YES | default=null
INDEXES: clients_pkey, clients_slug_unique
custom_domain: NULL on all six rows
```

Left in exactly this six-row state after all mutation cycles — re-confirmed as
the final action.

**Migration.** `drizzle/0006_cultured_mikhail_rasputin.sql` is exactly
`ALTER TABLE "clients" ADD COLUMN "template_key" varchar(60);` +
`--> statement-breakpoint` + a commented backfill
`UPDATE … WHERE "vertical" = 'realestate' AND "template_key" IS NULL;`.
Nullable, no default, no table rewrite, no long lock; the `UPDATE` is idempotent
and predicated on `vertical` rather than a slug list. Chain intact: the journal
gained `idx 6 / 0006_cultured_mikhail_rasputin`, and `0006_snapshot.json`'s
`prevId` (`8bdbc11f-404a-4237-85c2-e8e776f403ec`) equals `0005_snapshot.json`'s
`id`. Safe against live rows.

**Module probes.** I executed the real `lib/templates/index.ts` through `tsx`
rather than reading it. Full matrix in *Edge Cases Verified*.

## Commands Executed

**There is no test suite.** `package.json` defines no `test`, `lint` or
`typecheck` script — I confirmed this by reading it. Nothing below is a test
result; `pnpm build` is the typecheck. `pnpm dry-run` was **not** run (stale).

```
git status --porcelain / git diff / git diff -U0 / git diff --numstat / git hash-object
rm -rf .next && pnpm build                       # EXIT=0, one attempt
find .next/server/app/site -name '*.html' | ...  # method A, version-agnostic
node -e "…prerender-manifest.json…"              # method B
node --env-file=.env.local <scratch>/db.mjs      # all DB reads and the AC6/AC7 mutations
./node_modules/.bin/tsx <scratch>/probe.ts       # prototype-key matrix on the real module
tsx …/seed-client.ts verifier-probe              # seed validation, from a scratch cwd
pnpm dev                                         # 6 full stop / rm -rf .next / restart cycles
curl …                                           # sweep, negative cases, prototype URLs, sitemaps
pnpm check:content high-properties / arora-k-associates
grep -rn …                                       # AC2, AC3, AC9, isolation, compliance greps
```

## Results

`pnpm build` — **green, first attempt, from a wiped `.next`**:

```
✓ Compiled successfully in 6.7s
  Finished TypeScript in 9.1s
✓ Generating static pages using 15 workers (9659/9659) in 103s
EXIT=0
```

No Postgres `53300` (which would have been a CD-00 regression) and no `53200`
(machine memory pressure). Neither escalation path was needed; one build run.

**AC 4 — the primary regression signal, re-derived from my own build.**
I used **both** methods the plan offers.

Method A, version-agnostic on-disk HTML
(`find .next/server/app/site -name '*.html' | sed 's|.*/site/||' | cut -d/ -f1 | sed 's/\.html$//' | sort | uniq -c`):

```
     42 arora-k-associates
    546 evergreen-real-estate
    547 expert-realtors
   5005 high-properties
   1071 nayra-realtors
   1071 urban-flat-real-estate
```

Method B, `.next/prerender-manifest.json`: identical figures.
Per-tenant sum = 8282 = `find .next/server/app/site -name '*.html' | wc -l`.

`diff work/CD-01-tenant-registry/prerendered-before.json <my own derivation>`
→ **no output**. All six match the pre-change baseline exactly, and match the
figures the brief specified.

**The silent-failure mode is ruled out on disk, not inferred from a green build.**
The two `generateStaticParams` gates really did produce pages:

| Route family | `[slug]` / `[sector]` pages | + index pages | total |
|---|---|---|---|
| `builders/*` | 128 | 6 | **134** |
| `sectors/*` | 170 | 6 | **176** |

`high-properties` alone carries `builders=115`, `sectors=134`. Had
`activeTenants()`'s widening been wrong, both gates would have evaluated
`undefined !== "premium-v2"`, returned `[]`, and `high-properties` would have
lost roughly 249 pages — it is unchanged at 5005. The coder's reported 134/176
reconcile exactly once the index pages are counted.

**Sitemap URL sets.** I recomputed the sorted `<loc>` digest for all six
families across the coder's before/after captures:

| family | URLs before/after | sorted-loc digest | raw file |
|---|---|---|---|
| core | 120/120 | MATCH | byte-differs (order only) |
| localities | 56/56 | MATCH | byte-identical |
| properties | 1300/1300 | MATCH | byte-identical |
| register | 308/308 | MATCH | byte-identical |
| services | 20/20 | MATCH | byte-identical |
| updates | 18/18 | MATCH | byte-differs (order only) |

My own live `core.xml` capture from the current tree diffs **identically**
against the coder's after-capture (sorted `<loc>`). The ordering-only difference
in two families is the ruled `sitemapClients()`-has-no-`ORDER BY` finding, not a
URL change.

## Tenant Sweep

Dev server, `TENANT_MODE=path`, `localhost:3000`, all six tenants (the brief
asked for two; the routes were already warm so I ran all six).

| Tenant | URL | Status | Rendered correctly? |
|---|---|---|---|
| high-properties | `/realestate/temp-premium-v2/high-properties` | 200 | yes — `data-template="premium-v2"`, `data-vertical="realestate"`, 31 `gp-container` |
| high-properties | `…/properties` | 200 | yes |
| high-properties | `…/services` | 200 | yes |
| high-properties | `…/contact` | 200 | yes |
| evergreen-real-estate | home / properties / services / contact | 200 / 200 / 200 / 200 | yes — `premium-v2`, 28 `gp-container` |
| expert-realtors | home / properties / services / contact | 200 / 200 / 200 / 200 | yes — `premium-v2`, 30 `gp-container` |
| nayra-realtors | home / properties / services / contact | 200 / 200 / 200 / 200 | yes — `premium-v2`, 30 `gp-container` |
| urban-flat-real-estate (thinner tenant; the guinea pig) | home / properties / services / contact | 200 / 200 / 200 / 200 | yes — `premium-v2`, 30 `gp-container` |
| arora-k-associates (cafirm) | `/cafirm/arora-k-associates` + 3 routes | 200 / 200 / 200 / 200 | yes — `data-template` **absent**, `data-vertical="cafirm"` |

Every status code and every attribute value matches the coder's
`pages-before.txt`, i.e. the pre-change baseline. `high-properties` — the live
client — was never mutated at any point in my verification.

## Edge Cases Verified

**1. The prototype-chain hardening — executed against the real module, probing
eight prototype members, not only the four named.**

```
templateKeyFor:              premium-v2 -> "premium-v2"
  constructor, toString, valueOf, __proto__, hasOwnProperty,
  isPrototypeOf, propertyIsEnumerable, toLocaleString  -> undefined (all)
  premiumv2, PREMIUM-V2, " premium-v2", "", null,
  row=null, row=undefined                              -> undefined

isTemplateUrlSlug:           temp-premium-v2 -> true
  all eight prototype members -> false ; temp-bogus -> false

getTemplateKeyForUrlSlug:    temp-premium-v2 -> string "premium-v2"
  all eight prototype members -> undefined ; temp-bogus -> undefined

getTenantPath:               premium-v2 -> /realestate/temp-premium-v2/high-properties
  constructor / null / premium-v3 (realestate) -> /realestate/<slug>   (no /undefined/)
  cafirm                                       -> /cafirm/arora-k-associates
```

Baseline confirming the fix is load-bearing:
`'constructor' in {'premium-v2':1}` → **true**;
`Object.hasOwn({'premium-v2':1},'constructor')` → **false**. Reverting any of the
three `Object.hasOwn` calls to `in` / a bare index read restores the defect
immediately.

Both hardened functions live in `lib/templates/index.ts`, not `proxy.ts` —
confirmed. `proxy.ts` is byte-identical.

**2. The one intentional behaviour change, confirmed live and bounded.**

| URL | Result |
|---|---|
| `/realestate/constructor/high-properties` | **307 → `http://localhost:3000/`** |
| `/realestate/toString/high-properties` | **307 → `/`** |
| `/realestate/valueOf/high-properties` | **307 → `/`** |
| `/realestate/__proto__/high-properties` | **307 → `/`** |
| `/realestate/hasOwnProperty/high-properties` | **307 → `/`** |

Traced through the production code path rather than inferred: `proxy.ts:103`
`if (!isTemplateUrlSlug(templateUrlSlug) || …) return NextResponse.redirect(new URL("/", …))`.
Before the fix `isTemplateUrlSlug("constructor")` returned `true`, so proxy
rewrote to `/site/high-properties` and served a real client's site at a nonsense
URL. It now behaves like any other unrecognised segment.

**No legitimate URL moved.** `temp-premium-v2` still resolves for all five
real-estate tenants (200, `data-template="premium-v2"`), `temp-bogus` and
`temp-luxury-showcase` still 307 → `/`, and `getTenantPath` still emits the
identical `/realestate/temp-premium-v2/<slug>` string for all six rows.

**3. Negative cases — equality bar met.**

| URL | Mine | Coder's before-baseline |
|---|---|---|
| `/realestate/temp-luxury-showcase/high-properties` | 307 → `/` | 307 |
| `/realestate/temp-bogus/high-properties` | 307 → `/` | — |
| `/site/high-properties` | 307 → `/` | 307 |
| `/cafirm/high-properties` | **200** | **200** |

`/cafirm/<realestate-slug>` returning 200 is unchanged before and after, which is
the bar the manager set (Open Decision 5 plus the `task.md` "Manager
correction"); the task file's original 404 claim was a manager error. Not a
defect of this increment.

**4. Seed validation — I executed it rather than trusting the report.** Run from
a scratch working directory so the repo's `clients/` tree and the database were
never touched:

| `template:` | exit | stderr | wrote anything? |
|---|---|---|---|
| `premiumv2` | **1** | `profile.yaml sets template: "premiumv2", which is not a template this codebase can render. Valid keys: premium-v2. Nothing was written.` | no |
| `constructor` | **1** | same, naming `"constructor"` | no |
| `PREMIUM-V2` | **1** | same, naming `"PREMIUM-V2"` | no |

`select count(*) from clients` → **6** after all three; no `verifier-probe` row
exists. I also traced the ordering in `scripts/seed-client.ts`: the validation
sits between `readYaml` and `db.insert(clients)`, which is the first write in
`main()`, so "Nothing was written" is literally true rather than aspirational.
`main().catch(…)` exits 1, so the failure is visible to a caller.

## Regression Check For Prior Defects

Each defect re-verified by tracing the production code path and executing it, not
by reading the report's prose.

| Defect | Fix in production code | Verified by | If reverted |
|---|---|---|---|
| **Cycle 1 / D1** — `templateKeyFor` used `key in TEMPLATE_REGISTRY` | `lib/templates/index.ts` — `Object.hasOwn(TEMPLATE_REGISTRY, key)` | Executed the module: all eight prototype members → `undefined` | `template_key='constructor'` would return a `TemplateKey`, set `data-template="constructor"` (matching no palette in `app/globals.css`) and make `getTenantPath` emit `/realestate/undefined/<slug>` — every internal link on that tenant broken |
| **Cycle 1 / D2** — seed wrote `profile.template` unvalidated | `scripts/seed-client.ts` — registry check before the first write | Executed with three bad values: exit 1, nothing written | A typo in `profile.yaml` would seed successfully, exit 0, and leave a permanently 404ing tenant with no diagnostic anywhere |
| **Cycle 1 / D3** — `lookup-actions` bounced the operator silently | `app/lookup-actions.ts` — explicit `error` return before `redirect` | Read the diff: the guard sits after the existing `!client.isActive` guard and before `redirect(getTenantPath(client))`; no auth, ownership or query change | An operator entering a valid, active client ID with a broken assignment lands back on the form with no explanation |
| **Cycle 2 / D4** — `isTemplateUrlSlug` used `in` | `lib/templates/index.ts` — `Object.hasOwn(URL_SLUG_TO_KEY, urlSlug)` | Live HTTP: five prototype segments → 307 → `/` | `/realestate/constructor/high-properties` would serve the live client's site at a duplicate URL |
| **Cycle 2 / D5** — `getTemplateKeyForUrlSlug` bare index read | `lib/templates/index.ts` — guarded read | Executed: prototype members now `undefined`, previously returned a **function** | An accessor typed `TemplateKey \| undefined` would hand back `Object`'s constructor; `lib/tenant.ts` failed closed only by accident, because it compares against a string |

All five hold. Cycle 1's *Standing Finding 3* is genuinely closed by cycle 2 —
the weakness it recorded no longer exists.

## Correctness Review

**Functional correctness.** All nine ACs pass against evidence I gathered.

**Module ownership.** Intact, verified by `git status --porcelain` on the plan's
`Explicitly NOT touched` list — `proxy.ts`, `lib/content.ts`, `lib/actions/**`,
`components/**`, `app/globals.css`, `lib/verticals/**`, `lib/premium-v2/**`,
`lib/og.ts`, `docs/client-dashboard-brief.md`, `scripts/dry-run.ts`,
`next.config.ts`, `lib/auth.ts`, `lib/platform-auth.ts` all return **empty**.
`proxy.ts` has no database access. `lib/tenant.ts` still re-verifies vertical
(`urlVertical !== row.vertical → null`) and template
(`urlTemplateKey !== clientTemplateKey → null`) in `getTenant()`, and now also
re-verifies the template in `getTenantBySlug()`. Copy still lives in
`lib/premium-v2/` — that directory is untouched.

**Database correctness and migration safety.** Verified against live rows above.
Nullable `ADD COLUMN` with no default (no rewrite, no long lock), a five-row
idempotent backfill, forward-only, `arora-k-associates` untouched at NULL. No
index, no unique constraint, no `NOT NULL`, no `CHECK`, no `pgEnum`, no FK — all
deliberate per the plan and all confirmed absent in `pg_indexes` /
`information_schema`.

**Tenant isolation.** Unweakened. The whole code diff contains **zero** lines
mentioning `clientId`, `assertOwnership`, `requireUser`, `requireAdmin` or
`FormData` — the only hits are prose in `AGENTS.md`. `lib/content.ts`,
`lib/actions/**` and `components/**` have empty diffs, so no content query lost a
`clientId` scope. The three `clients`-table queries in scope
(`lookupClientBySlug` by `slug`; `activeTenants` and `sitemapClients` by
`is_active`) are unchanged in their predicates; `clients` *is* the tenant
registry, so `clientId` scoping does not apply to it. Isolation is
**strengthened** in one place: an unrecognised `template_key` now fails closed to
a 404 instead of being impossible-by-construction.

**Authorization.** No Server Action added or changed. `app/lookup-actions.ts` is
the only action file touched, and only to add an error return and change one
call's argument shape; its `!client.isActive` guard is byte-identical. Nothing is
trusted from `FormData` that was not trusted before.

**Rendering strategy.** No `headers()` and no `getTenant()` call was introduced
anywhere under `(public)` — `git diff -- "app/site/[tenant]/(public)"` grepped
for both returns nothing. `properties/loading.tsx`'s pre-existing `getTenant()`
is unchanged and provably not worsened (it substituted
`getTemplateKeyForSlug(tenant?.slug)` → `templateKeyFor(tenant)` on a row it
already held). Routes still prerender — proven from disk, not from the build
summary: 8282 HTML files, per-tenant counts identical to baseline.

**Caching.** No cache key changed and none needed to. `lookupClientBySlug`'s
`unstable_cache` parts are `["client-by-slug"]` plus the `slug` argument, and
`slug` is the only thing that varies the result. No new cached function. No
`revalidatePath` / `revalidateTag` is needed because no Server Action in this
increment writes anything — correct, not an omission.

**Cross-tenant blast radius.** This is global infrastructure, and `components/**`
including `components/realestate/premium-v2/*` is entirely untouched, so no
shared premium-v2 change leaked to the other four clients. The positive evidence
is that all six tenants' prerendered counts and all six tenants' sweep results
are unchanged.

**Content integrity.** The only YAML change is five one-line
`template: premium-v2` additions. Carrying no `_status` is correct here —
`template` is deployment infrastructure in the same class as `slug` and
`vertical`, neither of which carries one, and the value is the assignment those
tenants already had in code, not a new claim about a business. No address, phone,
year or testimonial was invented. `arora-k-associates/profile.yaml` correctly
gains nothing.

*AC 9, claim by claim.* I checked every assertion in both rewritten comments
against the code rather than accepting the read-back:

- `lib/domains.ts` no longer says `proxy.ts` "cannot reach the database" — and
  the replacement agrees with `proxy.ts`'s own header, which says Next 16 runs it
  on Node. ✓
- No longer says "keep the two in step" — the AC-9 grep across
  `AGENTS.md README.md docs/ lib/` returns only `docs/client-dashboard-brief.md:84`
  (historical, unedited). ✓
- No longer claims the `*.vercel.app` host is in the map — and it is not:
  `HOST_TENANT_MAP` holds exactly `highproperties.in` and
  `www.highproperties.in`, with `PRIMARY_HOST_TENANT = process.env.PRIMARY_TENANT_SLUG`
  as the fallback, exactly as the new comment states. ✓
- Its claim that `clients.custom_domain` is read by `lib/tenant.ts`'s host
  fallback and by `lib/actions/submit-query.ts`: true — `lib/tenant.ts:112` and
  `lib/actions/submit-query.ts:59` both query `eq(clients.customDomain, …)`. ✓
- Its claim that `prefixFor()` / `originFor()` prefer `NEXT_PUBLIC_SITE_URL` in
  host mode: true — `lib/sitemap.ts:100` short-circuits on `HOST_MODE`, and
  `lib/og.ts:78-85` does the same. ✓
- `lib/templates/index.ts` no longer justifies a slug-keyed map; its claim that
  `proxy.ts` calls `isTemplateUrlSlug()` on every request is true
  (`proxy.ts:4,103`). ✓

Neither comment contradicts anything in the code.

**Regulatory compliance.** Untouched, and verifiably so: the code diff contains
no line mentioning `reviewsEnabled`, RERA, `registration`, `testimonial` or
`illustrative` — the only such lines are `AGENTS.md` prose *documenting* those
rules. No listing, disclosure or testimonial surface changed. `reviewsEnabled` is
not read by this increment, so `arora-k-associates` keeps its `false`. RERA
"registration pending" handling in `PropertyCard` is untouched.

**SEO and indexing.** `prefixFor(client)` now calls `getTenantPath(client)`; I
proved by execution that it returns the identical string for all six rows, and
the sitemap URL sets are byte-identical across all six families.
`clients.custom_domain` is NULL on all six rows — confirmed, and confirmed *not*
a live defect, because `prefixFor()` returns `siteOrigin()` on `HOST_MODE` before
reading the column. `lib/domains.ts`'s map agrees with the code. The gated `/` is
still `robots: { index: false, follow: false }` (`app/page.tsx:10`), as is the
tenant dashboard (`dashboard/layout.tsx:10`). No doorway page added. The one
intentional indexing improvement — a deactivated tenant now 404s as well as being
out of the sitemap — is a de-index fix, not a leak.

**Link correctness.** No hardcoded `/realestate/temp-premium-v2/<slug>` prefix
appears in the diff. `basePathFor` still short-circuits to `""` under
`HOST_MODE`, and `getTenantPath` stayed synchronous, so nothing in the
internal-link layer or in the Client Components that call `basePathFor(tenant)`
had to change. Nothing would 404 in host mode.

**Evidence quality.** The coder's evidence proves the behaviour rather than
merely accompanying it — the on-disk HTML cross-check, the runtime module probes
and the row-unchanged proof for the seed negative cases are the right shape. Two
places where I went further than the report before being satisfied: the
prerendered counts (re-derived from my own build) and the seed validation
(re-executed). Both held.

**Scope discipline.** `git status --porcelain` lists 55 entries — the same 55 the
increment started with; my verification created no file in the repo (all scratch
work lives in the session scratchpad). Every tracked file is on the plan's
`Expected Files / Modules` list. `M app/layout.tsx` is the pre-existing
`suppressHydrationWarning` change (I read it — it is only that), and
`M lib/db/index.ts` is CD-00's pool cap; neither is attributable to CD-01.
`current-status.md` still reads `CD-01-tenant-registry — IN PROGRESS`, correctly
left for the manager.

*One plan divergence, resolved correctly.* The plan's comment spec asked the new
`lib/templates/index.ts` header to name `CLIENT_SLUG_TEMPLATE_MAP`; AC 2 and the
AC-9 grep both require that string to be absent. The coder kept the full
substance and dropped only the dead identifier. AC 2 is an acceptance criterion
and the comment spec is guidance, so this is the right resolution. Not a finding.

## Blocking Findings

**None.**

## Non-Blocking Improvements

### NB-1 — `lib/domains.ts:51` carries the same prototype-chain defect Amendment 1 closed next door

`tenantSlugForHost` does a bare index read on a plain object:

```ts
export function tenantSlugForHost(host: string): string | null {
  const clean = host.split(":")[0].toLowerCase();
  return HOST_TENANT_MAP[clean] ?? (PRIMARY_HOST_TENANT || null);
}
```

Because `clean` is lowercased, two `Object.prototype` members survive:
`constructor` and `__proto__`. `Host: constructor` on a host-mode deployment
returns the `Object` **function** from an accessor typed `string | null` — so
that request does *not* fall back to `PRIMARY_HOST_TENANT` the way every other
unmapped hostname does. It fails closed downstream (`getTenantBySlug` finds no
row → 404) and needs a deliberately malformed `Host` header, so severity is low.

This is **pre-existing** and correctly outside CD-01's approved scope —
`lib/domains.ts` is a comment-only file in this plan — so I am not failing the
increment for it. But Amendment 1's own argument applies verbatim: two instances
of one bug, one fixed and one not, invites a future reader to harmonise them in
the wrong direction. Recommend a one-line follow-up
(`Object.hasOwn(HOST_TENANT_MAP, clean) ? HOST_TENANT_MAP[clean] : (PRIMARY_HOST_TENANT || null)`),
ideally in CD-03, which already opens the domain story.

### NB-2 — `sitemapClients()` ordering (ruled; I agree it is non-blocking, with a caveat)

The ruling is right that sitemap order carries no SEO meaning and that URL *sets*
are what matter. The caveat worth recording: proving that required sorting the
output, i.e. the increment's own regression evidence was weakened by the
non-determinism. A one-line `.orderBy(clients.slug)` would make future
before/after sitemap comparisons a plain `diff`. Worth a line in a later
increment.

### NB-3 — the plan's `gp-container` expectation for the cafirm tenant is slightly wrong

The plan says `gp-container` should be **absent** for `arora-k-associates`. It is
present **once**, inside the RSC flight payload (a `gp-container` class on a
not-found / boundary chunk), both before and after. No premium-v2 chrome renders
— `data-template` is correctly absent and `data-vertical="cafirm"`. The code is
right; the plan's evidence wording is imprecise. Worth correcting so a future
verifier does not read `1` as a regression.

### NB-4 — `AGENTS.md`'s guide body is untracked, so CD-01's doc edit is not reviewable as a diff

`git show HEAD:AGENTS.md` is 9 lines (the Next auto-generated block only); the
working copy is 205. The diff is therefore 196 insertions / 0 deletions, and the
"Adding a tenant" rewrite cannot be isolated from the pre-existing uncommitted
body. I verified the content by reading it: step 2 now instructs
`template: premium-v2` in `profile.yaml`, states that `pnpm seed:client` writes it
to `clients.template_key`, and states that a `realestate` row whose value is null
or unrecognised **404s**; the custom-domain note no longer says "kept in step".
`README.md` is correspondingly fixed and *is* a proper diff. Recommend the
manager commit the `AGENTS.md` body so the next increment's doc changes are
reviewable.

### NB-5 — `pnpm dry-run` is stale (standing finding, not a CD-01 regression)

`scripts/dry-run.ts:14,48-50` still targets `temp-luxury-showcase`,
`temp-advisory`, `temp-market-intel` and `temp-locality` — templates removed long
before this increment. Not run, correctly. Already documented in `AGENTS.md`.

### Rulings I was invited to challenge

I do not challenge any of them. `getTenant()` deferring `isActive` (recorded as
Known Limitation 1, and I confirmed by reading `getTenant()` that it is genuinely
*not* fixed — only `templateKeyFor(row)` was substituted there), the absent cache
tag on `lookupClientBySlug` (~10-minute compounded lag), `/cafirm/<realestate-slug>`
returning 200, sitemap ordering, and deploy-before-migrate are all correctly
ruled and correctly recorded as known limitations rather than silently carried.

## Delivery Readiness

**A pass here is not a delivery.** `pnpm check:content` on the two tenants the
plan names:

| Tenant | Result |
|---|---|
| `high-properties` (live client) | **3 placeholder · 3 pending** — `content/legal.yaml`, `content/localities.yaml` and `content/updates.yaml` are whole-file placeholder; `analytics.search_console_verification` and `notification_email` pending |
| `arora-k-associates` | **11 placeholder · 9 pending** — including `seo.title`, `seo.description`, `team`, `content/compliance.yaml`, `content/legal.yaml`, `content/services.yaml`, `content/updates.yaml` |

None of these is introduced by CD-01 — the new `template:` key adds no
placeholder and renders nothing — but `high-properties` is a real business's live
site currently serving three whole placeholder content files. That is a delivery
blocker for the client, tracked separately from this increment.

`clients.custom_domain` is NULL on all six rows including `high-properties`.
Confirmed not a live SEO defect (host mode short-circuits before reading it);
CD-03 owns populating it.

## Final Verdict

**VERIFY_PASS**

The work item is implemented, the approved plan including Amendment 1 is
satisfied, module boundaries are respected, tenant isolation is intact and
slightly strengthened, and every acceptance criterion is backed by evidence I
observed myself rather than accepted from the report. The primary regression
signal — per-tenant prerendered route counts — was re-derived from my own build
by both of the plan's methods and matches the pre-change baseline exactly, with
the two `generateStaticParams` gates confirmed to have produced 134 `builders/*`
and 176 `sectors/*` pages on disk. The single intentional behaviour change is
real, bounded, and moved no legitimate URL. No blocking findings.
