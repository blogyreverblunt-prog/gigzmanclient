# ARCHITECTURE PLAN

## Work Item

CD-02 — Per-client feature flags move from code to the database.

Five per-client gates live as hardcoded `Set<string>` allowlists in four source
files. Move them onto `clients.features` (jsonb) so CD-03's dashboard can toggle
them, **without turning any call site async** — several are synchronous and one
crosses a Client Component boundary.

Reference: `docs/client-dashboard-brief.md` §2 item 0C and §11.

## Expected Functional Outcome

**Nothing user-visible changes.** Every tenant renders exactly the sections and
exactly the route families it renders today, with identical status codes,
identical home-page composition and identical sitemap URL sets.

The outcome is structural: after this increment, changing a row's `features`
value changes what a tenant publishes, with no code edit and no deploy. That is
the precondition for CD-03's toggle UI.

One capability is genuinely new and is the proof the mechanism works: a flag
flipped in SQL changes the rendered output within the cache window (AC 10).

## Affected Tenants

The five `realestate` tenants. `arora-k-associates` (cafirm) is unaffected —
none of these flags apply to its vertical and its `features` stays `{}`.

**Per-client gated by definition** — this work item *is* the gating mechanism.
**The refactor itself is global**: it edits the shared `premium-v2` template
(`FooterV2`, `PremiumV2Home`, `PremiumV2CalculatorsIndexPage`,
`PremiumV2EmiCalculatorPage`) and the shared public layout, so a mistake reaches
all five real-estate clients at once — and `(public)/layout.tsx` is shared with
`arora-k-associates` too, so the blast radius of that one file is all six.

State of the flags, read out of the four source files. **This is the behaviour
the migration must reproduce exactly:**

| Flag | high-properties | evergreen | expert | nayra | urban-flat | arora (cafirm) |
|---|---|---|---|---|---|---|
| `propertyMap` | **false** | true | true | true | true | `{}` |
| `propertyManagementSection` | true | false | false | false | false | `{}` |
| `propertyManagementPage` | true | false | false | false | false | `{}` |
| `vastuSectors` | true | false | false | false | false | `{}` |
| `homeLoan` | true | false | false | **true** | **true** | `{}` |

`propertyMap` is **opt-out**: four tenants are `true` and only `high-properties`
is `false`. Normalising it into an allowlist would silently strip a section from
four live sites and the home page would still render, so nothing would fail
loudly. Getting this polarity backwards is failure mode #3.

`high-properties` is the live client on its own domain. **Never mutate its row
for evidence.** `urban-flat-real-estate` is the designated guinea pig, as in
CD-01.

## Existing Implementation

Verified by reading, not assumed.

**The four allowlist files** (`lib/premium-v2/home-sections.ts`,
`lib/vastu/enabled.ts`, `lib/home-loan/enabled.ts`; `lib/premium-v2/tools.ts`
consumes one). Every helper has the identical shape:

```ts
export function homeLoanEnabled(clientSlug: string | undefined | null): boolean {
  if (!clientSlug) return false;
  return HOME_LOAN_TENANTS.has(clientSlug);
}
```

**A finding that makes the defaults non-arbitrary:** each helper's existing
null-guard already encodes its default — `propertyMapSectionEnabled(null)`
returns `true`, the other four return `false`. The documented defaults table
below is therefore not a new invention; it is the behaviour already in the code,
promoted from a null-guard to a named constant.

**22 flag-helper call sites across 13 files** — the manager's count is exact and
I re-derived it:

| File | Sites | Lines | Note |
|---|---|---|---|
| `lib/sitemap.ts` | 4 | 138, 141, 160, 222 | `Client = typeof clients.$inferSelect`, full row in hand |
| `components/realestate/premium-v2/FooterV2.tsx` | 1 | 64 | **`"use client"`** |
| `components/realestate/templates/PremiumV2Home.tsx` | 2 | 166, 186 | Server Component, holds `tenant: Tenant` |
| `lib/premium-v2/tools.ts` | 1 | 36 | inside `toolLinksFor` |
| `(public)/home-loan/[slug]/page.tsx` | 2 | **29 (gSP)**, 78 | |
| `(public)/home-loan/[slug]/[amount]/page.tsx` | 2 | **16 (gSP)**, 52 | |
| `(public)/home-loan/page.tsx` | 1 | 36 | |
| `(public)/calculators/[key]/page.tsx` | 1 | 63 | |
| `(public)/property-management/page.tsx` | 2 | 27, 53 | |
| `(public)/vastu/page.tsx` | 1 | 108 | |
| `(public)/vastu/gurugram/page.tsx` | 1 | 39 | |
| `(public)/vastu/gurugram/[sector]/page.tsx` | 2 | **24 (gSP)**, 54 | gSP **re-resolves** via `getTenantBySlug` |
| `(public)/vastu/gurugram/[sector]/[aspect]/page.tsx` | 2 | **30 (gSP)**, 63 | gSP **re-resolves** via `getTenantBySlug` |

### Correction to the manager analysis — three more files

The analysis says `toolLinksFor`'s "sole caller is `(public)/layout.tsx:147`".
That is true of `toolLinksFor` and **false of `toolHrefsFor`**, which wraps it
and whose first parameter changes shape identically. `toolHrefsFor` has **three**
callers, two of them in files the analysis does not list:

| File | Line | Call |
|---|---|---|
| `app/site/[tenant]/(public)/layout.tsx` | 147 | `toolLinksFor(tenant.slug)` |
| `components/realestate/templates/PremiumV2Home.tsx` | 178 | `toolHrefsFor(tenant.slug, basePath)` |
| `components/realestate/premium-v2/PremiumV2CalculatorsIndexPage.tsx` | **23** | `toolHrefsFor(tenant.slug, basePath)` |
| `components/realestate/premium-v2/PremiumV2EmiCalculatorPage.tsx` | **28** | `toolHrefsFor(tenant.slug, basePath)` |

All four are **Server Components** and all four already hold `tenant: Tenant`
(verified: each is an `async` default export with no `"use client"`; the latter
two are `({ tenant }: { tenant: Tenant })`). So the substitution is mechanical —
but two files are missing from the manager's table and would otherwise be
discovered only when the build broke.

### The Client Component boundary — exactly one crossing, confirmed

`FooterV2.tsx` is `"use client"` (line 1), imports `homeLoanEnabled` (line 11),
declares `clientSlug: string` (line 31) and uses it at **line 64 only**.
`(public)/layout.tsx:197` passes `clientSlug={tenant.slug}`.

I checked for further crossings and cleared two false positives:
`CalculatorsV2.tsx` mentions `lib/premium-v2/tools.ts` only in a **comment** and
declares its own structural `tools` prop type (line 20); `HeaderV2.tsx` declares
its own local `interface ToolLink` (line 71). Neither imports the module.
**`FooterV2` is the only client-boundary crossing in this increment.**

### The `generateStaticParams` asymmetry — do not harmonise the two shapes

The four gSP gates are **not** the same and must not be made the same:

- **home-loan** (`[slug]:29`, `[slug]/[amount]:16`) gate on `tenant.slug`, where
  `tenant` is the `StaticParamTenant` `paramsForEachTenant` supplies. That type
  is `{ id, slug, vertical, templateKey }` after CD-01 and **does not carry
  `features`**. This is Risk 1 and it is handled by widening the projection first
  (see *Data Access*).
- **vastu** (`[sector]:24`, `[sector]/[aspect]:30`) already do
  `const t = await getTenantBySlug(tenant.slug)` and gate on `t`, which is the
  **full row**. They also apply `!t` and `t.vertical !== "realestate"` checks that
  the home-loan gates do not.

**Instruction to the coder: change only the argument in the vastu gates
(`vastuSectorsEnabled(t.slug)` → `vastuSectorsEnabled(t)`). Do not delete the
`await getTenantBySlug(tenant.slug)` line on the grounds that `tenant` now
carries `features` too.** `getTenantBySlug` additionally applies the `isActive`
guard and the `templateKeyFor` validation CD-01 added; `activeTenants()` filters
`isActive` but performs no template validation. Removing the re-resolution would
silently drop that check from the two largest prerendered families.

### Other facts established by reading

- `lib/tenant.ts:23` `lookupClientBySlug` is `unstable_cache([...], ["client-by-slug"], { revalidate: 300 })` and does `db.select()` — **all columns** — so `features` arrives automatically with **no cache-key change**.
- The next migration is **`0007`**. `drizzle/meta/_journal.json` ends at `idx 6 / 0006_cultured_mikhail_rasputin` (CD-01's).
- `clients` has **no** `features` column today (grep: no hits in `lib/db/schema.ts`).
- Only `properties/loading.tsx` exists under `(public)`. `/property-management`, `/home-loan` and `/vastu/gurugram` have **no `loading.tsx`**, so their `notFound()` produces a real 404 rather than the soft-404 (200 shell) recorded as a standing finding for `/properties`. The status-code evidence below is therefore sound.
- `README.md` mentions none of these toggles (grep). **No README change.**
- `lib/content.ts` reads none of these helpers. **Untouched.**

### The collision hazard nobody has named yet

**`profile.yaml` already has a top-level `features:` key, and it means something
completely different.** In all six client files it holds the *firm-settings*
booleans, which `scripts/seed-client.ts:109` reads:

```yaml
features:
  reviews: true
  pricing: true
  awards: false
  client_logos: false
  team: false
```

```ts
const features = profile.features ?? {};          // scripts/seed-client.ts:109
  reviewsEnabled: features.reviews ?? false,      // → firm_settings, NOT clients
```

A coder wiring `features: profile.features` into the `clients` upsert — the
obvious move, and precisely what CD-01's precedent invites — would write
`{"reviews":true,"pricing":true,...}` into `clients.features`. `featureEnabled`
would find none of its five keys, fall back to defaults, and **every tenant would
silently get `propertyMap: true` and the other four `false`** — `high-properties`
would gain the map section and lose property-management, vastu sectors and
home-loan. The column would *look* populated, so a `select` would not reveal it.

See *Content / YAML Changes* for the ruling and the guard.

## Owning Modules

Ownership is preserved exactly; nothing crosses a boundary.

| Module | Role |
|---|---|
| `proxy.ts` | **Untouched.** No import changes, no database access. Byte-identical. |
| `lib/tenant.ts` | **Untouched.** `lookupClientBySlug` already selects all columns. |
| `lib/content.ts` | **Untouched.** No read-side query added; zero new round trips. |
| `lib/actions/` | **Untouched.** No Server Action added or changed — CD-03 owns writes. |
| `lib/features.ts` | **New.** Owns `ClientFeatures`, the defaults table and the single validating accessor. Zero imports. |
| `lib/db/schema.ts` | Owns the new column; type-only import of `ClientFeatures`. |
| `lib/static-params.ts` | Owns the build-time projection; widened a second time. |
| `lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`, `lib/home-loan/enabled.ts` | Keep their names, files, exports and reasoning. Bodies become delegates. |
| `lib/premium-v2/tools.ts` | Template copy; parameter shape changes only. |
| `lib/sitemap.ts` | Four mechanical substitutions. |
| `components/` | Presentational. `FooterV2` swaps a prop; three server components swap an argument. No component gains a lookup or a database import. |
| `lib/verticals/`, `lib/templates/`, `lib/domains.ts` | **Untouched.** |

## Dependencies

- **CD-01 (complete, VERIFY_PASS)** — `StaticParamTenant` must exist to be
  widened, and `templateKeyFor` is already in place at several of these files.
- **CD-00 (complete, VERIFY_PASS)** — its pool cap is what makes `pnpm build`
  completable, and the build is the primary regression signal.
- **No new packages. No new external service. No new table.**

## Domain Models

One concept moves layers, and the split must stay crisp:

- **Which features exist** — *"what can this codebase gate?"* Stays in **code**:
  the `ClientFeatures` key set, and `FEATURE_DEFAULTS`. Adding a flag is a code
  change, because the gated component has to exist.
- **Which features a client has** — *"what does this client publish?"* Moves to
  **data**: `clients.features`. Turning one on is a data change, because the
  client is data.

`featureEnabled()` is the one place the two meet: it takes a data value and
returns it only if it is actually a boolean under a key the code knows.

This is the same shape CD-01 established for the template registry, and the
answer to the prompt's question — **yes, CD-01's single-validating-accessor
pattern fits, and it fits harder here**, for a reason CD-01 did not have:

- CD-01's substitution was a **rename** (`getTemplateKeyForSlug` → `templateKeyFor`),
  so the build broke on a missing import.
- Here the helper **names do not change** — the task requires that. The only
  thing that forces the build to break at all 22 sites is the **argument type**.
  So the accessor's parameter type is not a style choice, it is the entire
  mechanism by which `pnpm build` becomes the checklist.

## Database Changes

### Existing tables reused

`clients` — the only table touched. No other table is read or written.

### Tables changed/added

`clients`: one new column. **No new table.**

### Columns

In `lib/db/schema.ts`, inside `export const clients = pgTable("clients", {…})`,
immediately after `templateKey`:

```ts
  /**
   * Per-client feature gates. Five booleans that decide which optional
   * premium-v2 sections and route families this tenant publishes.
   *
   * The reasoning for each flag lives next to its accessor
   * (`lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`,
   * `lib/home-loan/enabled.ts`) — two of them are not preferences: home-loan
   * asserts a DSA relationship, and vastu sectors has already failed a deploy.
   *
   * jsonb rather than five boolean columns because the set grows (CD-03 and
   * CD-07 add more) and a flag should not cost a migration. It is NOT hiding a
   * relationship: this is a closed set of booleans owned by exactly one row,
   * with no cardinality, no history and no query predicate — nothing here is
   * ever a `WHERE` clause. Do not put anything relational in it.
   *
   * `notNull().default({})` so a row created without one is well-defined:
   * `{}` means "every documented default", not "unknown". The defaults are NOT
   * uniform — `propertyMap` defaults true, the other four false — and they are
   * declared once in `FEATURE_DEFAULTS`.
   *
   * Read only through `featureEnabled()`. jsonb has no type checking, so a
   * hand-written `"yes"`, `1` or `null` must not reach a boolean gate.
   */
  features: jsonb("features").$type<ClientFeatures>().notNull().default({}),
```

with, at the top of the file, a **type-only** import:

```ts
import type { ClientFeatures } from "@/lib/features";
```

- **Classification: mutable state.** Not stable identity (it changes over a
  client's life, unlike `slug`/`vertical`/`templateKey`), not editorial content
  (nothing here is rendered text), not observation history (no versioning, no
  timestamp, last write wins).
- **Tenant scope:** the column *is* on the tenant row; there is no `clientId`
  scoping question. No query anywhere reads `clients` unscoped by `slug` or `id`.
- **Mutability:** operator-editable (SQL today, CD-03's **platform** dashboard
  later). **Not** editable from the tenant dashboard — see *Authorization*.
- **Numeric precision:** N/A. No numeric field; all five values are booleans.
- **Lifecycle/status enum:** N/A. These are independent booleans, not a lifecycle.

### Constraints

- **`NOT NULL`, `DEFAULT '{}'::jsonb`.** Both required by the task.
- **No unique constraint.** Many clients deliberately share a feature vector;
  three of the five rows are identical. Per-client uniqueness is meaningless here.
- **No `CHECK`.** The valid set is the code-side key list and the valid value set
  is `true`/`false`; validation is `featureEnabled()`, which is fail-safe to the
  documented default rather than fail-closed to `false` — because for
  `propertyMap` the safe answer is `true`.
- **No `pgEnum`.** Not a lifecycle column.

**Runtime caveat that the `NOT NULL` does not cover:** `'null'::jsonb` is a valid
non-null jsonb value, so `row.features` can be JSON `null` at runtime while the
TypeScript type says `ClientFeatures`. `featureEnabled` must guard for it
(`typeof null === "object"`, so a bare `typeof f !== "object"` check is not
enough — check `!f` first).

### Indexes

**None. State this explicitly so no one adds one.** Every read of `clients` is by
`slug` (already `.unique()`, already indexed) or by `id` (PK). `features` is
never a query predicate — it is read off a row already fetched. The only queries
that filter `clients` at all (`sitemapClients()`, `activeTenants()`) filter on
`is_active` across six rows. A GIN index on a six-row table would be pure cost.

### Relationships

No new FK, no new join. `clients.id` remains the parent of every content table
via `onDelete: "cascade"`, unchanged.

### Migration strategy

Generated with `pnpm db:generate` → `drizzle/0007_<random>.sql` (journal ends at
`idx 6`; new entry is `idx 7`). Do **not** hand-write the DDL. Expected generated
statement:

```sql
ALTER TABLE "clients" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;
```

drizzle-kit does not generate data statements, so the backfill is appended by
hand after a `--> statement-breakpoint`, exactly as CD-01 did. That is the
project's supported way to add a data step.

The finished `drizzle/0007_*.sql` must be exactly the generated `ALTER` plus:

```sql
--> statement-breakpoint
-- CD-02 backfill. Reproduces, exactly, the five Set<string> allowlists this
-- migration replaces (lib/premium-v2/home-sections.ts, lib/vastu/enabled.ts,
-- lib/home-loan/enabled.ts). All five keys are written explicitly on all five
-- realestate rows -- including the ones that equal the documented default --
-- so the row is self-describing, so a single SELECT audits the whole matrix,
-- and so the migration does not silently depend on FEATURE_DEFAULTS being
-- right. arora-k-associates is deliberately untouched and keeps '{}': none of
-- these flags applies to the cafirm vertical.
--
-- Predicated on explicit slugs, NOT on `vertical` as CD-01's backfill was.
-- CD-01 could say "every realestate tenant renders premium-v2"; there is no
-- equivalent true statement here -- the flags differ per client, which is the
-- whole point. A realestate row created after this migration correctly gets
-- '{}', i.e. the documented defaults, which is the right answer for a new
-- client.
UPDATE "clients" SET "features" = '{"propertyMap":false,"propertyManagementSection":true,"propertyManagementPage":true,"vastuSectors":true,"homeLoan":true}'::jsonb
  WHERE "slug" = 'high-properties';--> statement-breakpoint
UPDATE "clients" SET "features" = '{"propertyMap":true,"propertyManagementSection":false,"propertyManagementPage":false,"vastuSectors":false,"homeLoan":false}'::jsonb
  WHERE "slug" IN ('evergreen-real-estate', 'expert-realtors');--> statement-breakpoint
UPDATE "clients" SET "features" = '{"propertyMap":true,"propertyManagementSection":false,"propertyManagementPage":false,"vastuSectors":false,"homeLoan":true}'::jsonb
  WHERE "slug" IN ('nayra-realtors', 'urban-flat-real-estate');
```

Three statements, grouped by identical feature vector. Each is an **absolute
assignment, not a merge**, so the backfill is idempotent.

**Safety against live rows.** The column is `NOT NULL` with a **constant**
default, which Postgres 11+ stores in the catalogue — no table rewrite, no long
lock. The three `UPDATE`s touch five rows. Forward-only; nothing is destroyed.

**Ordering is load-bearing, and the failure mode differs from CD-01's.**
`db.select()` names every column in the table definition, so new code against a
pre-migration database errors with `42703 column "features" does not exist` —
loud, not silent. But the **cached payload** hazard is the dangerous one and it
fails *wrong*, not closed: a cache entry written by pre-change code (no
`features`) and read by post-change code yields `undefined` → defaults →
`high-properties` renders **with** the map section and **without**
property-management, and every home-loan and vastu-sector page 404s, for up to
300s. Nothing errors; it just serves the wrong site.

- **Deploy:** migrate **before** the new code serves traffic. A new deployment id
  invalidates Next's data cache in production, which closes the window in
  practice — but the ordering is still mandatory.
- **Locally:** after `pnpm db:migrate`, stop the dev server, `rm -rf .next`, and
  restart. The Postgres client is cached on `globalThis`, so a hot reload is not
  enough. **If a tenant renders the wrong sections immediately after
  implementing, do this before investigating anything else.**

## Data Access (lib/content.ts)

**`lib/content.ts` is not touched.** No new query, no new cached function, no new
cache key. Every one of the 22 substituted call sites reads a field off a row it
already has in hand — this increment adds **zero database round trips**.

Two read-side modules outside `lib/content.ts` change:

### 1. `lib/features.ts` — new, and the whole design lives here

Zero imports, so it is safe in any bundle and can never drag `lib/db` into a
client component.

```ts
/**
 * Per-client feature gates, and the single accessor every gate reads through.
 *
 * These five flags lived as hardcoded Set<string> allowlists in four files
 * until CD-02. They are row data now so a dashboard can toggle them without a
 * deploy. What did NOT change: the accessors are still synchronous, because
 * they are called from generateStaticParams, from lib/sitemap.ts, and inline
 * in JSX. Making any of them async breaks the build.
 *
 * This module imports nothing on purpose. It is reached from `lib/db/schema.ts`
 * (type-only), from the three gate modules, and from `lib/static-params.ts`;
 * a database import here would follow the accessor into a client bundle.
 */
export type ClientFeatures = {
  propertyMap?: boolean;
  propertyManagementSection?: boolean;
  propertyManagementPage?: boolean;
  vastuSectors?: boolean;
  homeLoan?: boolean;
};

export type FeatureKey = keyof ClientFeatures;

/**
 * What an absent key means. NOT uniform, and that asymmetry is inherited, not
 * invented: it is exactly what each helper's old `if (!clientSlug) return …`
 * guard already did.
 *
 * `propertyMap` is opt-OUT — four of five tenants have it on — so its default
 * is `true` and a `{}` tenant gets the map. The other four are opt-IN: a
 * section with another client's branding baked into the artwork, a page family
 * that asserts a DSA relationship, and a 3,700-route matrix that has already
 * failed a deploy are all things a new tenant must ask for, never inherit.
 */
export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  propertyMap: true,
  propertyManagementSection: false,
  propertyManagementPage: false,
  vastuSectors: false,
  homeLoan: false,
};

/**
 * Anything carrying a resolved `features` value — the `clients` row, or the
 * build-time projection in `lib/static-params.ts`.
 *
 * `features` is REQUIRED, not optional, and that is load-bearing. Typed
 * `features?: ClientFeatures`, a `StaticParamTenant` that had not been widened
 * would satisfy this structurally, `featureEnabled` would silently return the
 * default for every tenant, and the home-loan generateStaticParams gates would
 * return [] and prerender nothing while the build reported success. Required,
 * they fail to typecheck instead. Do not relax this.
 */
export type FeatureHost = { features: ClientFeatures };

export function featureEnabled(
  host: FeatureHost | null | undefined,
  key: FeatureKey,
): boolean {
  const f = host?.features;
  // `'null'::jsonb` is a valid NOT NULL value and `typeof null === "object"`,
  // so the falsy check has to come first.
  if (!f || typeof f !== "object") return FEATURE_DEFAULTS[key];
  // `Object.hasOwn` rather than `in` / a bare index read: the same
  // prototype-chain defect CD-01's Amendment 1 closed three times in
  // `lib/templates/index.ts`. Harmonised in the correct direction.
  const raw = Object.hasOwn(f, key) ? (f as Record<string, unknown>)[key] : undefined;
  // jsonb is untyped at the database level. Anything that is not literally a
  // boolean is treated as absent rather than coerced.
  return typeof raw === "boolean" ? raw : FEATURE_DEFAULTS[key];
}
```

### 2. `lib/static-params.ts` — the projection widens a second time

**This is the single highest-value detail in the plan**, because getting it wrong
is invisible until it silently prerenders nothing. Add `features` to both the
type and the `select`:

```ts
export type StaticParamTenant = {
  id: string;
  slug: string;
  vertical: string;
  templateKey: string | null;
  features: ClientFeatures;
};

export async function activeTenants(): Promise<StaticParamTenant[]> {
  try {
    const rows = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        vertical: clients.vertical,
        templateKey: clients.templateKey,
        features: clients.features,
      })
      .from(clients)
      .where(eq(clients.isActive, true));
    return TENANT_ONLY.length > 0 ? rows.filter((r) => TENANT_ONLY.includes(r.slug)) : rows;
  } catch {
    return [];
  }
}
```

with `import type { ClientFeatures } from "@/lib/features";` and the existing
doc comment on `StaticParamTenant` extended to record the second widening and
its reason (the home-loan gates, by name).

The widening is purely additive: the other `paramsForEachTenant` callers and
`app/site/[tenant]/layout.tsx` use only `id`/`slug`/`templateKey` and keep
compiling untouched. The `isActive` filter and the `TENANT_ONLY` narrowing stay
exactly as they are.

**Sequencing is mandatory: this edit lands BEFORE either home-loan gate is
touched** (see *Implementation Sequence* steps 3 and 6). If
`homeLoanEnabled(tenant)` does not compile in those two files, the widening was
missed — **fix the projection, never the gate.**

## Server Actions (lib/actions/)

**None added, none changed.** `lib/actions/dashboard-actions.ts` and
`lib/actions/submit-query.ts` do not read a feature flag and are out of scope.
No `revalidatePath` / `revalidateTag` call is added, because nothing in this
increment writes. CD-03 owns the write path, its authorization, its hard cap and
its revalidation.

## Routes

**No route is added, removed, renamed or re-parameterised.** Every route family
keeps exactly the tenants it has today. The complete edit list:

### Flag-helper substitutions (22 sites, 13 files)

Every site of the form `xEnabled(tenant.slug)` becomes `xEnabled(tenant)` where
`tenant` is the resolved row already in scope. Signature-compatible in return
type (`boolean` → `boolean`), so every `if (!…)`, every `? :` and every JSX use
is provably type-equivalent.

| File | Edit |
|---|---|
| `(public)/calculators/[key]/page.tsx:63` | `homeLoanEnabled(tenant)` |
| `(public)/home-loan/page.tsx:36` | `!tenant \|\| !homeLoanEnabled(tenant)` |
| `(public)/home-loan/[slug]/page.tsx:29` | **gSP** — `!homeLoanEnabled(tenant)` on `StaticParamTenant`; compiles only after the widening |
| `(public)/home-loan/[slug]/page.tsx:78` | `!tenant \|\| !homeLoanEnabled(tenant)` |
| `(public)/home-loan/[slug]/[amount]/page.tsx:16` | **gSP** — same as above |
| `(public)/home-loan/[slug]/[amount]/page.tsx:52` | `!tenant \|\| !homeLoanEnabled(tenant)` |
| `(public)/property-management/page.tsx:27` | `!tenant \|\| !propertyManagementPageEnabled(tenant)` |
| `(public)/property-management/page.tsx:53` | `!propertyManagementPageEnabled(tenant)` |
| `(public)/vastu/page.tsx:108` | `vastuSectorsEnabled(tenant)` |
| `(public)/vastu/gurugram/page.tsx:39` | `!vastuSectorsEnabled(tenant)` |
| `(public)/vastu/gurugram/[sector]/page.tsx:24` | **gSP** — `!vastuSectorsEnabled(t)`; **keep the `getTenantBySlug` re-resolution** |
| `(public)/vastu/gurugram/[sector]/page.tsx:54` | `!vastuSectorsEnabled(tenant)` |
| `(public)/vastu/gurugram/[sector]/[aspect]/page.tsx:30` | **gSP** — `!vastuSectorsEnabled(t)`; **keep the re-resolution** |
| `(public)/vastu/gurugram/[sector]/[aspect]/page.tsx:63` | `!vastuSectorsEnabled(tenant)` |
| `components/realestate/templates/PremiumV2Home.tsx:166` | `propertyMapSectionEnabled(tenant)` |
| `components/realestate/templates/PremiumV2Home.tsx:186` | `propertyManagementSectionEnabled(tenant)` |
| `lib/premium-v2/tools.ts:36` | `homeLoanEnabled(host)` — parameter renamed, see below |
| `lib/sitemap.ts:138` | `homeLoanEnabled(client)` |
| `lib/sitemap.ts:141` | `vastuSectorsEnabled(client)` |
| `lib/sitemap.ts:160` | `!homeLoanEnabled(client)` |
| `lib/sitemap.ts:222` | `!vastuSectorsEnabled(client)` |
| `components/realestate/premium-v2/FooterV2.tsx:64` | **prop, not a call** — see below |

`lib/sitemap.ts` also drops nothing from its imports: it still imports
`homeLoanEnabled` and `vastuSectorsEnabled` from the same paths.

### `toolLinksFor` / `toolHrefsFor` — parameter shape (4 sites, 4 files)

`lib/premium-v2/tools.ts`:

```ts
export function toolLinksFor(host: FeatureHost | null | undefined): ToolLink[]
export function toolHrefsFor(host: FeatureHost | null | undefined, basePath: string)
```

with the internal call at line 64 becoming `toolLinksFor(host)` and line 36
`homeLoanEnabled(host)`. Callers:

| File | Line | Edit |
|---|---|---|
| `(public)/layout.tsx` | 147 | `toolLinksFor(tenant)` |
| `PremiumV2Home.tsx` | 178 | `toolHrefsFor(tenant, basePath)` |
| `PremiumV2CalculatorsIndexPage.tsx` | 23 | `toolHrefsFor(tenant, basePath)` |
| `PremiumV2EmiCalculatorPage.tsx` | 28 | `toolHrefsFor(tenant, basePath)` |

`lib/premium-v2/tools.ts` imports `FeatureHost` as a **type-only** import
alongside its existing `homeLoanEnabled` import.

### `FooterV2` — the one client boundary

Three edits, all in `components/realestate/premium-v2/FooterV2.tsx`:

1. **Delete line 11**, `import { homeLoanEnabled } from "@/lib/home-loan/enabled";`
2. **Line 31**, replace `clientSlug: string;` with:

   ```ts
     /**
      * Computed on the server by `(public)/layout.tsx`. This component is
      * "use client", so it cannot read the tenant row — and the flag must not
      * become an async lookup, because there is no server to await here.
      */
     homeLoanEnabled: boolean;
   ```
3. **Line 34** destructure `homeLoanEnabled` instead of `clientSlug`; **line 64**
   becomes `...(homeLoanEnabled ? [{ label: "Home Loans", href: p("/home-loan") }] : [])`.

`clientSlug` was used at line 64 **only** — verified — so it becomes dead and
must be removed rather than left as a prop that lies about why it exists.

**No shadowing problem:** the import is deleted, so the destructured prop is the
only `homeLoanEnabled` binding in the file. In `(public)/layout.tsx` the JSX
attribute name is not a binding, so `homeLoanEnabled={homeLoanEnabled(tenant)}`
is unambiguous.

`(public)/layout.tsx:197` becomes:

```tsx
<FooterV2 settings={settings} basePath={basePath || "/"} homeLoanEnabled={homeLoanEnabled(tenant)} />
```

and the file gains `import { homeLoanEnabled } from "@/lib/home-loan/enabled";`
(it does not import it today — it only imports `toolLinksFor`).

### The three gate modules — names, files and exports all stay

Each helper's body becomes a one-line delegate. `lib/home-loan/enabled.ts`, in
full, as the pattern for all five:

```ts
import { featureEnabled, type FeatureHost } from "@/lib/features";

/**  … reasoning comment, rewritten — see below … */
export function homeLoanEnabled(tenant: FeatureHost | null | undefined): boolean {
  return featureEnabled(tenant, "homeLoan");
}
```

The `Set<string>` constants (`MAP_SECTION_DISABLED`,
`PROPERTY_MANAGEMENT_TENANTS`, `PROPERTY_MANAGEMENT_PAGE_TENANTS`,
`VASTU_SECTOR_TENANTS`, `HOME_LOAN_TENANTS`) are **deleted**. AC evidence greps
for them below.

**Rejected alternative, recorded so it is not re-proposed:** delete the three
modules and have all 22 call sites call `featureEnabled(tenant, "homeLoan")`
directly. Rejected on two grounds — it scatters five string keys across 22 sites
where a typo is a silent default rather than a type error, and it destroys the
only sensible home for each flag's domain reasoning, which the next section makes
a deliverable.

## Rendering Strategy

Unchanged for every route, and that is the acceptance bar.

- **Public pages continue to take the tenant from `params`** via
  `getTenantBySlug(params.tenant)`. **No page gains a `headers()` call.**
  `featureEnabled()` is a pure function over a value the page already holds; it
  reads no dynamic API and touches no database.
- **No helper becomes `async`.** `featureEnabled` and all five gates are plain
  synchronous functions. This is what keeps `lib/sitemap.ts`,
  `PremiumV2Home.tsx`'s inline JSX and the four `generateStaticParams` gates
  working, and it is why the parameter is the *row* rather than a lookup.
- **`generateStaticParams` return shapes are unchanged.** All four gated routes
  still return the **complete** param set including the ancestor `tenant`,
  because `paramsForEachTenant` still spreads `{ tenant: tenant.slug, ...row }`.
  Only the *type* of the object handed to the callback widens.
  - `home-loan/[slug]` → `{ tenant, slug }` for `LOAN_AMOUNTS` + `LENDERS`, for
    the three DSA tenants only.
  - `home-loan/[slug]/[amount]` → `{ tenant, slug, amount }`, the lender × amount
    matrix, same three tenants.
  - `vastu/gurugram/[sector]` → `{ tenant, sector }` for `SECTORS`,
    `high-properties` only.
  - `vastu/gurugram/[sector]/[aspect]` → `{ tenant, sector, aspect }`,
    `high-properties` only.
- `export const revalidate = 300` on `(public)/layout.tsx:35` is unchanged.
- `(public)/layout.tsx`'s `<Suspense>` boundary around `HeaderV2` is unchanged;
  `toolLinksFor(tenant)` is evaluated on the server before the boundary, exactly
  as `toolLinksFor(tenant.slug)` is today.

## Caching and Revalidation

- **No cache key changes, and none are permitted.** `lookupClientBySlug`'s
  `unstable_cache` key parts are `["client-by-slug"]` plus the `slug` argument,
  and `slug` remains the only thing that varies the result. `features` arrives
  free because the query is `db.select()` over all columns.
- **No new cached function** is added anywhere.
- **No `revalidatePath` / `revalidateTag`** is added, because no Server Action in
  this increment writes. Adding a cache tag now for CD-03's benefit would be
  scaffolding a future layer — CD-01 ruled the same question the same way and
  CD-03 owns it.
- **The lag window, documented not fixed.** A flag flipped directly in SQL is
  invisible for up to **300s** (the `unstable_cache` window), compounding with
  `(public)/layout.tsx`'s `revalidate = 300` to roughly **10 minutes**. This is
  the same window CD-01 documented.
  - *For evidence gathering:* every toggle step must **stop the dev server,
    `rm -rf .next`, run the SQL, restart**. That makes the result deterministic
    instead of racing a five-minute window. Do not "wait and retry".
  - *For CD-03:* the brief (§2 0C) requires the toggle action to revalidate and
    to say so on screen. Not pre-wired here.
- **The deploy-time payload-shape hazard** is in *Migration strategy* above and
  is the one place where a stale cache entry produces a wrong page rather than a
  404. It is the reason for the migrate-then-deploy ordering.

## Per-Client Gating

**Both answers apply, and conflating them is the risk.**

- **The flags are per-client data.** That is the deliverable.
- **The refactor is global.** Six shared files are edited, and a mistake in any
  of them reaches every tenant that renders it:

| Shared file | Reaches |
|---|---|
| `app/site/[tenant]/(public)/layout.tsx` | **all six tenants** (the `toolLinksFor` and `FooterV2` calls sit inside the `isPremiumV2` branch, but the file is the layout for every public page of every tenant) |
| `components/realestate/premium-v2/FooterV2.tsx` | all five real-estate tenants, every page |
| `components/realestate/templates/PremiumV2Home.tsx` | all five, home page |
| `components/realestate/premium-v2/PremiumV2CalculatorsIndexPage.tsx` | all five, `/calculators` |
| `components/realestate/premium-v2/PremiumV2EmiCalculatorPage.tsx` | evergreen + expert (the two without `homeLoan`; the other three are redirected to `/home-loan` by `calculators/[key]:63`) |
| `lib/premium-v2/tools.ts` | all five — header Tools menu, `/calculators` index, home page tools section |

No new `Set<string>` of slugs is added anywhere, and
`lib/premium-v2/positioning.ts` (hero copy) is **not touched** — it is not one of
the five flags and it is not a boolean. It stays in code and CD-07 owns it.

## Content / YAML Changes

**No `clients/*/profile.yaml` file is edited, and `scripts/seed-client.ts` does
not learn to write `clients.features`.** This is a deliberate divergence from
CD-01's precedent and the reasoning matters:

1. **No regression is introduced by omitting it**, which is the test CD-01 used.
   CD-01 *had* to change the seed path, because deleting `CLIENT_SLUG_TEMPLATE_MAP`
   turned `pnpm seed:client` into a producer of 404ing tenants. Here, a tenant
   seeded with no `features` gets `'{}'` — the documented defaults, which are the
   correct answer for a new client (map on, the three branded/regulated/expensive
   families off). And because the existing `onConflictDoUpdate` `set` block does
   not mention `features`, **re-seeding an existing client cannot null out its
   flags** — verified by reading `scripts/seed-client.ts:88–101`.
2. **The name is already taken, by something else** (see *Existing
   Implementation*). `profile.yaml`'s `features:` block is the firm-settings
   booleans (`reviews`, `pricing`, `awards`, `client_logos`, `team`). Wiring
   `profile.features` into the `clients` upsert writes the wrong object and every
   tenant silently reverts to defaults.
3. **The database is becoming the source of truth for these**, per the brief. A
   YAML key would create a second one that CD-09 (`yaml-db-truth`) would then have
   to unpick, and CD-03 — which owns the editing surface — has not yet decided
   what it needs.

**Two required guards against hazard 2**, both in `scripts/seed-client.ts`:

- **Rename the local at line 109** from `features` to `settingsFeatures`, and its
  five uses at the `reviewsEnabled` / `pricingEnabled` / `awardsEnabled` /
  `clientLogosEnabled` / `teamEnabled` lines. Six lines, one function, purely
  local, and the build typechecks it. This makes `features` an unbound identifier
  in that file, so the mistake cannot be made by autocomplete.
- **Add a comment** at the `clients` upsert (`scripts/seed-client.ts:80–101`)
  stating that `clients.features` is deliberately **not** seeded from YAML, that
  `profile.features` is a different thing entirely (firm settings), and that a
  new tenant correctly receives `'{}'` = the documented defaults in
  `lib/features.ts`.

**`_status`:** not applicable, and no field gains one. `_status` marks *claims
about the business* — address, phone, hours, registration numbers — so they can
be audited as `verified` / `placeholder` / `pending`. No YAML field is added, and
`clients.features` is deployment configuration in the same class as `slug`,
`vertical` and `template_key`, none of which carries `_status`. **No client fact
is invented and no new field renders anything.**

### Regulatory constraints

- **RERA:** untouched. No listing surface changes; `PropertyCard`'s
  "registration pending" handling is not in scope and no file that renders it is
  edited.
- **ICAI:** untouched. `reviewsEnabled` is not read by this increment and
  `arora-k-associates` keeps its `false`. None of the five flags applies to the
  `cafirm` vertical, which is why its row keeps `{}`.
- **The DSA claim (`homeLoan`) is the compliance-relevant flag here.** The pages
  state the firm is an authorised channel partner. This increment does not change
  which tenant asserts it. The confirmation checkbox is CD-03's; the *reason* it
  will exist must survive in the comment (below).

### The four comment rewrites — deliverables, not decoration

Each existing comment records a decision *and* its rejected alternative. Each
replacement must record the **new mechanism** while keeping the **why**, and must
contradict nothing in the code. The prompt asks where the reasoning should live
now that the `Set`s are gone. The answer, and the rule for CD-03:

> **The domain reasoning stays in the three gate modules, beside its accessor.
> The defaults and their justification live once in `lib/features.ts` beside
> `FEATURE_DEFAULTS`. CD-03 lifts its on-screen helper text from the gate module
> for each flag — one obvious lookup per flag.**

Rejected alternative: a `FEATURE_META` record in `lib/features.ts` carrying
`label` / `why` / `default` per flag, ready for CD-03 to render. Rejected as
scaffolding a future layer — nothing reads it in this increment, and CD-03 owns
the UI and will decide what fields it needs. Each rewritten comment must end with
a line saying it is the source for that helper text, so CD-03 does not go
looking.

**1. `lib/premium-v2/home-sections.ts`** — header plus three flag comments. Must
keep: the template is shared, so a section one client does not want cannot be
deleted from the composition; **the map section is a styled placeholder** —
decorative pins and toggles that switch nothing, pending the real Maps JS API —
and High Properties, a live client on its own domain, asked for it off while the
others keep it; **the property-management section and page artwork is
High-Properties-branded** (the phone mock, its screen, the logo on it, the
inspector's uniform, the owner-portal reference are baked into the supplied
images), so it reads as High Properties whoever renders it. Must now also state:
the allowlist is `clients.features`; `propertyMap` is opt-**out** (default
`true`) and the two property-management flags opt-**in** (default `false`);
a second client gets the section when there is art carrying their own brand.

**2. `lib/vastu/enabled.ts`** — must keep **both** reasons verbatim in substance:
(1) build output — ~3,700 prerendered routes per tenant, three tenants took 32
minutes and shipped, a fourth **blew the deployment output limit and failed the
deploy after 41 minutes**; (2) content quality — the pages differ only by sector
name and four corridor figures. Must keep the note that the **base** vastu pages
stay available to every real-estate tenant. Must now state that the gate is
`features.vastuSectors`, default `false`, and that **enabling it for a fourth
tenant is on `docs/client-dashboard-brief.md` §11's list of decisions no agent
may make alone** — CD-03 enforces that as a hard cap in the Server Action.

**3. `lib/home-loan/enabled.ts`** — must keep: the pages display lender
trademarks and describe the firm as an **authorised channel partner**, which is
only true for tenants holding a DSA relationship, and publishing it for one that
does not is a **misrepresentation**. Must keep the per-slug provenance note
(`nayra-realtors` and `urban-flat-real-estate` were added on the clients'
confirmation). Must now state that the gate is `features.homeLoan`, default
`false`, and that CD-03 puts a confirmation checkbox in front of it — so the
reason the flag is opt-in survives the move out of the file.

**4. `lib/premium-v2/tools.ts:34–36`** — the inline comment ("Tenants with a
lender relationship get the fuller financing hub; everyone else gets the same
calculator on its own page") is still true; adjust only if the parameter rename
makes it read oddly. Do not delete it.

### `AGENTS.md` — the table that this increment falsifies

`AGENTS.md:157` states **"Per-client feature toggles currently live in code, not
the database"** and lists five files. Four of the five rows become false the
moment this ships. Rewrite the paragraph and the table to:

| Toggle | `clients.features` key | Default when absent |
|---|---|---|
| Property map section | `propertyMap` | **true** (opt-out) |
| Property-management section | `propertyManagementSection` | false |
| Property-management page | `propertyManagementPage` | false |
| Vastu sectors | `vastuSectors` | false |
| Home-loan pages | `homeLoan` | false |

plus: the accessor is `featureEnabled(row, key)` in `lib/features.ts`, read
through the named helpers in `lib/premium-v2/home-sections.ts`,
`lib/vastu/enabled.ts` and `lib/home-loan/enabled.ts`; the helpers are
**synchronous** and take the tenant row, and must stay that way; and **hero copy
(`lib/premium-v2/positioning.ts`) is the one entry that is still code** — it is
not a boolean and CD-07 owns it. This is the same defect class as CD-01's
`AGENTS.md` fix: documentation instructing a reader to edit a mechanism that no
longer exists.

`README.md` mentions none of these toggles (verified by grep) and is **not**
edited.

## Authorization

**No change to either auth system.** `lib/platform-auth.ts`, `lib/auth.ts`,
`assertOwnership` and the `gz_platform_session` / `gz_session` cookies are
untouched. No Server Action is added, so there is no new POST surface and no new
ownership check to write.

One consequence must be **recorded now** so CD-03 does not get it wrong:
**`clients.features` belongs on the platform (operator) dashboard, not the tenant
dashboard.** Two of the five flags are not the tenant's to set —
`homeLoan` asserts a DSA relationship the operator must verify, and
`vastuSectors` can fail the whole deployment for every other tenant on it. A
tenant admin flipping either is a compliance or an availability incident. The
brief already places these in the platform dashboard (§2 0C, §3); this plan
records *why* that placement is mandatory rather than stylistic.

## Tenant Isolation

Unaffected and unweakened.

- **No query is added anywhere.** The only `clients`-table queries in scope
  (`lookupClientBySlug` by `slug`, `activeTenants()` and `sitemapClients()` by
  `is_active`) are unchanged in their predicates. `activeTenants()` gains one
  column in its projection and no change to its `WHERE`.
- **Not one content query changes**, so every `clientId`-scoped read in
  `lib/content.ts` stays exactly as it is. `clients` *is* the tenant registry, so
  `clientId` scoping does not apply to it.
- **The flag value can only come from the row being rendered.** After this
  change there is no slug-keyed lookup left, so it is structurally impossible for
  one tenant's gate to be answered from another tenant's data — the previous
  design took a bare `string` and would happily answer for any slug handed to it.
  That is a small, real strengthening.

## Failure Behaviour

| Condition | Behaviour | Where |
|---|---|---|
| Key absent from `features` | documented default (`propertyMap` true, other four false) | `featureEnabled` |
| `features` is `{}` (a CD-03-created tenant) | all five defaults; map on, other four off | `FEATURE_DEFAULTS` |
| `features` is `'null'::jsonb` | all five defaults; no throw | `featureEnabled`'s `!f` guard |
| Value is not a boolean (`"yes"`, `1`, `null`) | treated as absent → default | `featureEnabled`'s `typeof` check |
| Prototype-chain key (`constructor`, `__proto__`) | not reachable — `FeatureKey` is a closed union, and the read is `Object.hasOwn`-guarded | `featureEnabled` |
| `cafirm` tenant (`arora-k-associates`) | `{}` → defaults; none of the five gated surfaces exists in that vertical anyway | unchanged |
| Flag off → gated page requested | `notFound()` → **real 404** (no `loading.tsx` on any of the three routes) | the page's own gate |
| Flag off → gated section | section absent from the home page; page still 200 | `PremiumV2Home` |
| Flag flipped in SQL | takes effect within ≤300s (or immediately after `rm -rf .next` + restart) | `unstable_cache` |
| Database unreachable at build time | `activeTenants()` returns `[]`; routes fall back to on-demand; build does not fail | `lib/static-params.ts` catch, unchanged |
| Database unreachable at sitemap time | `sitemapClients()` returns `[]`; empty sitemap | `lib/sitemap.ts` catch, unchanged |
| New code, pre-migration database | `42703 column "features" does not exist` — loud | migrate first |
| Post-migration code reading a pre-migration cache entry | defaults for ≤300s → **wrong sections, no error** | `rm -rf .next`; see *Migration strategy* |

Nothing throws where it previously 404'd, and nothing 404s where it previously
rendered.

## SEO and Indexing Impact

**Target: zero change.** Every sitemap URL, canonical and JSON-LD block must be
identical before and after — a graded evidence item, not an assumption.

- **Sitemap:** `lib/sitemap.ts`'s four gates change argument shape, not output.
  `coreEntries` still adds `/home-loan` for three tenants and `/vastu/gurugram`
  for one; `homeLoanEntries` and `vastuSectorEntries` still return `[]` for the
  rest. **Compare by URL set, not file order** — CD-01 established that
  `sitemapClients()` has no `ORDER BY`, so any write to `clients` (and this
  migration is one) reshuffles the output. The migration guarantees a reshuffle,
  so a raw `diff` **will** show differences that are not defects.
- **Canonicals:** unchanged. Built from `joinPath(basePathFor(tenant), path)`,
  which reads `templateKey`, not `features`.
- **JSON-LD:** unchanged. No gated surface emits a distinct block that moves.
- **robots:** untouched.
- **No new indexing behaviour, intentional or otherwise.** Unlike CD-01, this
  increment makes no page appear or disappear. If one does, it is a defect.

## Analytics

No change. The per-tenant gtag.js snippet stays in `(public)/layout.tsx` under
the same condition; no event, no property and no measurement id is touched.
`ScrollDepthTracker` and the CTA components are untouched.

## Evidence Required

There is no test suite. `package.json` has no `test`, `lint` or `typecheck`
script — do not invent one. `pnpm build` **is** the typecheck (~2 min, 9,659
pages). `pnpm dry-run` is stale — **do not run it**.

**Order is mandatory: capture the baseline on the clean tree before migrating or
editing anything.** Record actual output, not a summary.

**Build hazards, already diagnosed — do not misdiagnose them:**
- Postgres `53300` (*too many clients*) would be a **CD-00 regression** →
  **stop and escalate.**
- Postgres `53200` (*out of memory*) is known machine memory pressure on
  consecutive builds → **retry once with the machine otherwise idle.**

### Build

**1. Baseline, on the unmodified tree.**

```bash
rm -rf .next && pnpm build 2>&1 | tee work/CD-02-feature-flags/build-before.txt
find .next/server/app/site -name '*.html' | sed 's|.*/site/||' | cut -d/ -f1 \
  | sed 's/\.html$//' | sort | uniq -c | tee work/CD-02-feature-flags/prerendered-before.txt
```

**Expected, and this is a hard gate:**

```
     42 arora-k-associates
    546 evergreen-real-estate
    547 expert-realtors
   5005 high-properties
   1071 nayra-realtors
   1071 urban-flat-real-estate
```

**If the fresh baseline does not equal these six figures, stop and escalate** —
the tree has drifted since CD-01's verified build and this increment's primary
regression signal is not trustworthy.

**2. Per-family baseline — the direct proof against Risk 1.** The aggregate alone
is not enough: it says *something* moved, not *what*. Capture this too:

```bash
for t in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  printf '%-24s home-loan=%-5s vastu-gurugram=%-5s property-management=%s\n' "$t" \
    "$(find ".next/server/app/site/$t/home-loan" -name '*.html' 2>/dev/null | wc -l)" \
    "$(find ".next/server/app/site/$t/vastu/gurugram" -name '*.html' 2>/dev/null | wc -l)" \
    "$(ls ".next/server/app/site/$t/property-management.html" 2>/dev/null | wc -l)"
done | tee work/CD-02-feature-flags/families-before.txt
```

**Expected shape:** `home-loan` **non-zero** for `high-properties`,
`nayra-realtors`, `urban-flat-real-estate` and **0** for `evergreen-real-estate`,
`expert-realtors`; `vastu-gurugram` non-zero **only** for `high-properties`;
`property-management=1` **only** for `high-properties`. Record the actual
numbers — they are the after-comparison.

**3. After implementing:** rerun all three commands into `build-after.txt`,
`prerendered-after.txt`, `families-after.txt`, then:

```bash
diff work/CD-02-feature-flags/prerendered-before.txt work/CD-02-feature-flags/prerendered-after.txt
diff work/CD-02-feature-flags/families-before.txt     work/CD-02-feature-flags/families-after.txt
```

**Expected: no output from either.** A per-tenant or per-family count that drops
is a **failure**, not a detail. Report both files in full; "the build is green"
is not evidence for AC 3 — a broken `generateStaticParams` still reports success.

**4. The build is the typecheck.** `pnpm build` completing is AC 2's proof that
no helper became `async` and no call site gained an `await`: an `await`-less
`Promise<boolean>` in an `if` does not typecheck against these gates, and a bare
`string` does not satisfy `FeatureHost`.

### Rendered pages (per tenant)

Dev server on `localhost:3000`, `TENANT_MODE=path`, `P=/realestate/temp-premium-v2/<slug>`.

**The full 5 × 3 status matrix — the complete matrix, not a sample**, because
this increment is precisely about which tenant gets which page:

```bash
for s in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  for u in /property-management /home-loan /vastu/gurugram /vastu /calculators ""; do
    printf '%s %s%s\n' "$(curl -s -o /dev/null -w '%{http_code}' \
      "http://localhost:3000/realestate/temp-premium-v2/$s$u")" "$s" "$u"
  done
done
```

Run **before and after**, and diff. Expected, identical both times:

| Route | high-properties | evergreen | expert | nayra | urban-flat |
|---|---|---|---|---|---|
| `/property-management` | **200** | 404 | 404 | 404 | 404 |
| `/home-loan` | **200** | 404 | 404 | **200** | **200** |
| `/vastu/gurugram` | **200** | 404 | 404 | 404 | 404 |
| `/vastu` (base) | 200 | 200 | 200 | 200 | 200 |
| `/calculators` | 200 | 200 | 200 | 200 | 200 |
| home | 200 | 200 | 200 | 200 | 200 |

(The `/vastu` and `/calculators` rows are the control: they must **not** move.
None of these three gated routes has a `loading.tsx`, so a 404 here is a real
404, not the soft-404 recorded as a standing finding for `/properties`.)

**Home-page section composition (AC 4).** Exact markers, verified in the
components so the coder does not have to hunt for them:

| Section | Component | Grep marker |
|---|---|---|
| Property map | `MapSelectedPropertyV2.tsx:56` | `Explore Properties on the Map` |
| Property management | `PropertyManagementV2.tsx:161` | `End-to-end property management` |
| Vastu-sector block on `/vastu` | `vastu/page.tsx:108` | `By Gurugram sector` |

```bash
for s in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  h=$(curl -s "http://localhost:3000/realestate/temp-premium-v2/$s")
  printf '%-24s map=%s mgmt=%s\n' "$s" \
    "$(printf '%s' "$h" | grep -c 'Explore Properties on the Map')" \
    "$(printf '%s' "$h" | grep -c 'End-to-end property management')"
done
```

**Expected: `high-properties` → `map=0 mgmt≥1`; the other four → `map≥1 mgmt=0`.**
This is the direct check for the opt-out polarity inversion (failure mode #3).
Run before and after; the bar is that they match.

**Footer "Home Loans" link (AC 9)** — proves the prop reached `FooterV2`:

```bash
for s in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  printf '%-24s homeloanlink=%s\n' "$s" \
    "$(curl -s "http://localhost:3000/realestate/temp-premium-v2/$s" | grep -c '>Home Loans<')"
done
```

Expected: non-zero for exactly `high-properties`, `nayra-realtors`,
`urban-flat-real-estate`; **0** for `evergreen-real-estate` and `expert-realtors`.

**Sitemap — compare by SET, not by file order.** The migration writes to
`clients`, and `sitemapClients()` has no `ORDER BY`, so tenant order **will**
reshuffle and a raw `diff` will show non-defects:

```bash
for f in core properties register localities updates services; do
  curl -s "http://localhost:3000/sitemaps/$f.xml" \
    | grep -o '<loc>[^<]*</loc>' | sort > "/tmp/$f-before.txt"; done
# …implement…
for f in core properties register localities updates services; do
  curl -s "http://localhost:3000/sitemaps/$f.xml" \
    | grep -o '<loc>[^<]*</loc>' | sort > "/tmp/$f-after.txt"
  printf '%s before=%s after=%s ' "$f" "$(wc -l < /tmp/$f-before.txt)" "$(wc -l < /tmp/$f-after.txt)"
  diff -q "/tmp/$f-before.txt" "/tmp/$f-after.txt" && echo SET-MATCH; done
```

Expected: identical counts and `SET-MATCH` on all six families.

### Database checks

```sql
select slug, vertical, features from clients order by slug;
```

Expected exactly six rows, matching the *Affected Tenants* matrix:
`high-properties` with `propertyMap:false` and the other four `true`;
`evergreen-real-estate` and `expert-realtors` with `propertyMap:true` and four
`false`; `nayra-realtors` and `urban-flat-real-estate` with `propertyMap:true`,
`homeLoan:true`, three `false`; `arora-k-associates` with `{}`. (AC 1.)

A machine-checkable form of the same thing, which is stronger than eyeballing
JSON:

```sql
select slug,
       features->>'propertyMap'                as map,
       features->>'propertyManagementSection'  as pm_section,
       features->>'propertyManagementPage'     as pm_page,
       features->>'vastuSectors'               as vastu,
       features->>'homeLoan'                   as loan
from clients order by slug;
```

Column type and default:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'clients' and column_name = 'features';
-- expected: jsonb | NO | '{}'::jsonb
```

Index check — prove none was added:

```sql
select indexname from pg_indexes where tablename = 'clients';
-- expected exactly: clients_pkey, clients_slug_unique
```

There is no `psql` binary on this machine (CD-01's verifier established this).
Run these through the project's own `postgres` client from a scratch script in
the session scratchpad — **not** a file committed to the repo.

**Toggle proof (AC 10) — designed around cheap flags. `vastuSectors` is NOT to
be enabled for a second tenant, even briefly.** Guinea pig:
`urban-flat-real-estate`. **`high-properties` is never mutated.** Apply the full
stop / `rm -rf .next` / SQL / restart discipline around **every** statement:

*Proof A — a page family turns on and off (`propertyManagementPage`):*

```
1. baseline: /property-management on urban-flat → 404
2. UPDATE clients SET features = features || '{"propertyManagementPage":true}'::jsonb
     WHERE slug = 'urban-flat-real-estate';
3. stop / rm -rf .next / restart  →  /property-management on urban-flat → 200
4. UPDATE clients SET features = features || '{"propertyManagementPage":false}'::jsonb
     WHERE slug = 'urban-flat-real-estate';
5. stop / rm -rf .next / restart  →  /property-management on urban-flat → 404
```

Chosen over `homeLoan` deliberately: one page, no prerender cost, a binary 404/200
signal, and it does not put an unverified DSA claim on a tenant's site even for a
minute. **Note for the verifier:** step 3 renders High-Properties-branded artwork
on another tenant — that is exactly what the allowlist comment warns about, it is
local-dev only, and step 5 must prove it is gone.

*Proof B — the opt-out polarity is real (`propertyMap`):*

```
1. baseline: urban-flat home page contains 'Explore Properties on the Map'
2. UPDATE … '{"propertyMap":false}' … WHERE slug = 'urban-flat-real-estate';
3. stop / rm -rf .next / restart  →  marker count 0
4. UPDATE … '{"propertyMap":true}'  … WHERE slug = 'urban-flat-real-estate';
5. stop / rm -rf .next / restart  →  marker count ≥ 1
```

*Proof C — `{}` is well-defined, not accidental (the CD-03 case):*

```
1. UPDATE clients SET features = '{}'::jsonb WHERE slug = 'urban-flat-real-estate';
2. stop / rm -rf .next / restart
   → home page HAS the map section (propertyMap defaults true)
   → /property-management 404, /home-loan 404, /vastu/gurugram 404
     (the other four default false)
3. restore the row to its migration value and prove it with the SELECT above.
```

Proof C is the one that shows the defaults table is real and non-uniform, which is
what makes a tenant CD-03 creates well-defined. Note it deliberately turns
`homeLoan` **off** for `urban-flat-real-estate` — restoring it is not optional.

**Leave the database in the exact six-row state of the matrix. Confirm it with a
final `select` and paste the output.**

### Content checks

```bash
# AC: the five Set<string> allowlists are gone from the repo, entirely.
grep -rn "MAP_SECTION_DISABLED\|PROPERTY_MANAGEMENT_TENANTS\|PROPERTY_MANAGEMENT_PAGE_TENANTS\|VASTU_SECTOR_TENANTS\|HOME_LOAN_TENANTS" \
  --include=*.ts --include=*.tsx . | grep -v node_modules
# expected: no output

# AC 2: no helper became async and no call site awaits one.
grep -rn "await homeLoanEnabled\|await vastuSectorsEnabled\|await propertyMap\|await propertyManagement\|await featureEnabled\|async function featureEnabled\|export async function .*Enabled" \
  --include=*.ts --include=*.tsx . | grep -v node_modules
# expected: no output

# AC 2: FooterV2 performs no lookup and holds no slug.
grep -n "homeLoanEnabled\|clientSlug" components/realestate/premium-v2/FooterV2.tsx
# expected: exactly the prop declaration, the destructure and the line-64 use —
# NO import line, NO clientSlug anywhere.

# AC 2: no "use client" file imports a gate or the accessor.
grep -rl "lib/features\|home-loan/enabled\|vastu/enabled\|premium-v2/home-sections\|premium-v2/tools" \
  --include=*.ts --include=*.tsx . | grep -v node_modules | xargs grep -l '"use client"'
# expected: no output

# lib/features.ts imports nothing.
grep -c "^import" lib/features.ts
# expected: 0

# proxy.ts untouched.
git diff --stat proxy.ts && git status --porcelain proxy.ts
# expected: no output from either

# lib/content.ts and lib/actions/ untouched.
git status --porcelain lib/content.ts lib/actions/
# expected: no output

# seed-client no longer has a bare `features` identifier that could be
# mis-wired to clients.features.
grep -n "features" scripts/seed-client.ts
# expected: only `settingsFeatures` uses plus the explanatory comment

# AGENTS.md no longer claims the toggles live in code.
grep -n "toggles currently live in code" AGENTS.md
# expected: no output
```

**Scope isolation, given the tree-state caveat.** CD-00 and CD-01 are complete
but uncommitted, so `git diff` alone does not isolate this increment.
`work/CD-02-feature-flags/pre-state.txt` holds the 55-entry
`git status --porcelain` snapshot taken before CD-02 began (verified: 55 lines).
Anything not in it belongs to CD-02:

```bash
diff <(sort work/CD-02-feature-flags/pre-state.txt) <(git status --porcelain | sort)
```

Every added line must appear on the *Expected Files / Modules* list below. Nothing
may disappear. Report this diff in full.

**Delivery check** (a pass is not a delivery, per CD-01's precedent):

```bash
pnpm check:content high-properties
```

Expect the pre-existing 3 placeholder / 3 pending. This increment must not add to
it — no YAML field is added, so the count must be unchanged.

## Expected Files / Modules

**Schema and migration (4 files)**
- `lib/features.ts` — **new**. `ClientFeatures`, `FeatureKey`, `FEATURE_DEFAULTS`, `FeatureHost`, `featureEnabled`. Zero imports.
- `lib/db/schema.ts` — one column on `clients` + a type-only import.
- `drizzle/0007_<generated>.sql` — generated `ALTER`, plus the hand-appended three-statement backfill.
- `drizzle/meta/_journal.json`, `drizzle/meta/0007_snapshot.json` — generated.

**Core logic (5 files)**
- `lib/static-params.ts` — widen `StaticParamTenant` and the `activeTenants()` projection; extend the doc comment.
- `lib/premium-v2/home-sections.ts` — three delegates; three comment rewrites; delete three `Set`s.
- `lib/vastu/enabled.ts` — one delegate; comment rewrite; delete the `Set`.
- `lib/home-loan/enabled.ts` — one delegate; comment rewrite; delete the `Set`.
- `lib/premium-v2/tools.ts` — parameter shape on `toolLinksFor` and `toolHrefsFor`.

**Call sites (12 files)**
- `lib/sitemap.ts` — 4 substitutions.
- `app/site/[tenant]/(public)/`: `layout.tsx` (2 sites + 1 new import), `calculators/[key]/page.tsx`, `home-loan/page.tsx`, `home-loan/[slug]/page.tsx`, `home-loan/[slug]/[amount]/page.tsx`, `property-management/page.tsx`, `vastu/page.tsx`, `vastu/gurugram/page.tsx`, `vastu/gurugram/[sector]/page.tsx`, `vastu/gurugram/[sector]/[aspect]/page.tsx`.
- `components/realestate/templates/PremiumV2Home.tsx` — 3 sites.

**Components (3 files)**
- `components/realestate/premium-v2/FooterV2.tsx` — prop swap, import deletion.
- `components/realestate/premium-v2/PremiumV2CalculatorsIndexPage.tsx` — 1 argument.
- `components/realestate/premium-v2/PremiumV2EmiCalculatorPage.tsx` — 1 argument.

**Seed path and docs (2 files)**
- `scripts/seed-client.ts` — local rename + explanatory comment. **No new write.**
- `AGENTS.md` — the per-client-toggle table and its preamble.

**Explicitly NOT touched:** `proxy.ts`, `lib/tenant.ts`, `lib/content.ts`,
`lib/actions/**`, `lib/templates/**`, `lib/domains.ts`, `lib/verticals/**`,
`lib/premium-v2/positioning.ts`, `clients/*/profile.yaml`, `app/globals.css`,
`README.md`, `docs/client-dashboard-brief.md`, `scripts/dry-run.ts`,
`components/realestate/premium-v2/HeaderV2.tsx`,
`components/realestate/premium-v2/CalculatorsV2.tsx`.

## Implementation Sequence

Ordered so that every mistake fails loudly at the earliest possible step.

1. **Capture the baseline on the clean tree** — `build-before.txt`,
   `prerendered-before.txt`, `families-before.txt`, the 5 × 6 status matrix, the
   composition markers, the footer-link counts, the six sitemap URL sets.
   **Verify the six per-tenant figures equal CD-01's baseline; escalate if not.**
   Nothing else may be edited until these exist.
2. **`lib/features.ts`** — the new module, complete with `FEATURE_DEFAULTS` and
   the `FeatureHost` type. Nothing imports it yet.
3. **`lib/static-params.ts`** — widen the projection. **This must precede step 6.**
   Doing it here means the two home-loan gates fail to *typecheck* instead of
   silently prerendering zero pages.
4. **Schema + migration** — add the column to `lib/db/schema.ts`,
   `pnpm db:generate`, append the three-statement backfill to the generated
   `0007_*.sql`, `pnpm db:migrate`, verify with the `select`. **Restart the dev
   server** (globalThis-cached Postgres client).
5. **The three gate modules** — rewrite bodies as delegates, delete the five
   `Set`s, rewrite the four comments. **The build now breaks loudly at all 22
   call sites — that is the checklist.** Run `pnpm build` here just to read the
   error list; it is expected to fail.
6. **The two home-loan `generateStaticParams` gates**
   (`home-loan/[slug]/page.tsx:29`, `home-loan/[slug]/[amount]/page.tsx:16`).
   They compile **only** because of step 3. If either does not, go back and fix
   the projection — **never the gate.**
7. **The two vastu `generateStaticParams` gates** — change the argument only.
   **Keep `await getTenantBySlug(tenant.slug)`.** Do not harmonise with step 6.
8. **The remaining page and sitemap substitutions** — the other 16 flag-helper
   sites across `calculators/[key]`, `home-loan/page`, the two `home-loan` page
   bodies, `property-management`, the four `vastu` page bodies, `PremiumV2Home`
   and `lib/sitemap.ts`.
9. **`lib/premium-v2/tools.ts`** + its four callers (`(public)/layout.tsx:147`,
   `PremiumV2Home.tsx:178`, `PremiumV2CalculatorsIndexPage.tsx:23`,
   `PremiumV2EmiCalculatorPage.tsx:28`).
10. **`FooterV2` + `(public)/layout.tsx:197`** — the prop, the deleted import in
    the component, the new import in the layout. **`pnpm build` after this step
    must be green.**
11. **`scripts/seed-client.ts`** — the `settingsFeatures` rename and the comment.
12. **`AGENTS.md`** — the toggle table.
13. **Evidence** — the after-build, both diffs, the full status matrix, the
    composition and footer checks, the sitemap set comparison, the three toggle
    proofs, the database checks, the greps, the scope-isolation diff. **Restore
    the database to its six-row state and prove it.**

## Acceptance Criteria Mapping

| AC | Satisfied by | Evidence |
|---|---|---|
| 1. `features` jsonb, non-null, default `{}`, backfilled exactly | Schema column + `0007_*.sql` three-statement backfill | `information_schema` query + the `features->>` matrix `select` |
| 2. No helper async, no call site awaits, `FooterV2` takes a prop | Synchronous `featureEnabled`; five synchronous delegates; prop swap | `pnpm build` green + the three AC-2 greps |
| 3. Build green; per-tenant prerendered counts match baseline | Widened `StaticParamTenant` keeps both home-loan gates working | `diff prerendered-before/after` **and** `diff families-before/after`, both empty |
| 4. Home-page composition unchanged for all five | `propertyMapSectionEnabled` / `propertyManagementSectionEnabled` read the row | the marker-count sweep, before vs after |
| 5. `/property-management` 200 on high-properties, 404 on four | `propertyManagementPageEnabled(tenant)` at lines 27 and 53 | the 5 × 3 status matrix |
| 6. `/home-loan` 200 on three, 404 on two | `homeLoanEnabled(tenant)` at 5 page sites | the 5 × 3 status matrix |
| 7. `/vastu/gurugram` 200 only on high-properties; `/vastu` available to all five | `vastuSectorsEnabled` at 6 sites | the 5 × 3 matrix incl. the `/vastu` control row |
| 8. Sitemap output per tenant unchanged | Four sitemap gates read the row already in hand | sorted `<loc>` set comparison, six families |
| 9. Footer "Home Loans" on exactly three tenants | `homeLoanEnabled(tenant)` computed in the layout, passed as a prop | the `>Home Loans<` count sweep |
| 10. A database flip changes output with no code change | The whole mechanism | Toggle proofs A, B and C |

**AC 8 wording note:** the task says "byte-identical". `sitemapClients()` has no
`ORDER BY` and this migration writes to `clients`, so tenant ordering **will**
reshuffle. The achievable and meaningful bar is **URL-set identity**, which is the
standing ruling from CD-01 (NB-2). Recorded in *Architecture Conflicts*.

## Non-Goals

- **Any dashboard UI or Server Action** for editing these — CD-03, including the
  vastu hard cap and the DSA confirmation checkbox.
- **Changing which tenant has which flag.** Behaviour is frozen; only the
  mechanism moves.
- **Adding a new flag**, including anything for `lib/premium-v2/positioning.ts`
  (hero copy — not a boolean, CD-07 owns it).
- **A `FEATURE_META` registry** of labels and helper text for CD-03 to render.
- **A cache tag on `lookupClientBySlug`**, or any change to the 300s window.
- **Seeding `clients.features` from YAML**, or adding a YAML key for it.
- **An index, a `CHECK`, a `pgEnum`, boolean columns or a `client_features` table.**
- Fixing CD-01's standing findings: `lib/domains.ts:51`'s prototype-chain defect,
  `sitemapClients()`'s missing `ORDER BY`, `properties/loading.tsx`'s `getTenant()`,
  `/cafirm/<realestate-slug>` returning 200. All CD-03 or later.
- Touching `proxy.ts`, `lib/content.ts`, `lib/actions/**`, `lib/tenant.ts`.

## Open Decisions

1. **`scripts/seed-client.ts` gets a local rename (`features` → `settingsFeatures`)
   and a comment, but no new write.** Judged in scope because this increment
   *creates* the collision hazard by introducing a second, different `features`
   concept. If the manager rules the rename out of scope, the comment alone must
   still land — the hazard is silent and the wrong outcome looks like a populated
   column.
2. **No YAML key and no seed write for `clients.features`.** Argued above on the
   grounds that omitting it introduces no regression (unlike CD-01's template),
   that the name is taken, and that CD-09 owns YAML-vs-DB truth. If the manager
   disagrees, the key must **not** be called `features` — `site_features:` — and
   the seed's `onConflictDoUpdate` must write it only when present, so a re-seed
   cannot null out a live flag.
3. **All five keys are written explicitly on all five rows**, including the ones
   equal to the default. The alternative — write only the deviations and let `{}`
   carry the rest — is smaller but makes the migration depend on
   `FEATURE_DEFAULTS` being right, and makes the audit `select` unreadable.
   Recommending explicit.
4. **`featureEnabled` returns the documented default for a `null` host**, matching
   each old helper's `if (!clientSlug)` guard exactly. No call site currently
   passes null (every one short-circuits on `!tenant` first), so this is
   defensive. Keeping it means one rule — "absent means default" — rather than
   two.
5. **CD-03 must place these on the platform dashboard, not the tenant
   dashboard.** Recorded under *Authorization* with the reasoning. Flagged here so
   CD-03 confirms it rather than rediscovering it.

## Architecture Conflicts

1. **The manager analysis's call-site table is incomplete.** It states
   `toolLinksFor`'s "sole caller is `(public)/layout.tsx:147`". That is true of
   `toolLinksFor` and false of `toolHrefsFor`, which wraps it:
   `PremiumV2CalculatorsIndexPage.tsx:23` and `PremiumV2EmiCalculatorPage.tsx:28`
   are two further files whose argument must change. Both are Server Components
   holding `tenant: Tenant`, so the fix is mechanical — but the files are absent
   from the analysis and from its "13 files" count. **The 22 flag-helper sites are
   correct; the file list for the increment is 16 files, not 13.** Recorded rather
   than silently absorbed, because the manager's table is what the coder will
   check its work against.

2. **`FeatureHost.features` is required, not optional — and this is the entire
   Risk 1 mitigation.** The brief's `ClientFeatures` type marks every *key*
   optional, which is right (an absent key means "default"). But the *host* type
   must require the `features` property itself. Typed
   `{ features?: ClientFeatures }`, an un-widened `StaticParamTenant` satisfies it
   structurally and the home-loan gates compile into silence. This is the one type
   decision in the plan that must not be "simplified".

3. **AC 8's "byte-identical" sitemap is not achievable and should not be.**
   `sitemapClients()` has no `ORDER BY` (CD-01 standing finding NB-2) and this
   migration writes to every real-estate row, guaranteeing a heap reshuffle. The
   evidence therefore compares **sorted URL sets**, which is the ruled bar. Flagged
   so a verifier does not read a reordered file as a regression, and so the AC's
   wording is amended by the manager rather than reinterpreted by the coder.

4. **Task constraint "do not hand-write SQL" vs the required backfill.**
   drizzle-kit cannot generate a data statement. Resolved as CD-01 resolved it:
   the DDL is generated by `pnpm db:generate` and not edited; the three backfill
   `UPDATE`s are appended after `--> statement-breakpoint` in the generated file.
   Flagged so it is not read as a violation.

5. **The brief (§2 0C) says the parameter becomes "the tenant row (or a
   `ClientFeatures` object)"; this plan takes a `FeatureHost`.** Deliberate: a
   bare `ClientFeatures` parameter would mean every one of the 22 call sites
   writes `homeLoanEnabled(tenant.features)`, which is (a) more to get wrong and
   (b) structurally satisfied by `{}` and by any object literal, destroying the
   type gate in conflict 2. Passing the host keeps the call sites reading exactly
   as they do today with one word changed, and keeps the compiler as the checklist.

## Manager Approval

APPROVED

Reviewed against the stage-3 bar: every AC maps to concrete implementation; no
query or action is added, so tenant scoping is unchanged and argued rather than
asserted; the migration is `NOT NULL` with a constant default plus an idempotent
absolute-assignment backfill, safe against live rows; no cache key changes and
the reason is traced; rendering strategy is stated per route; scope is bounded;
blast radius is named per shared file.

Four claims verified independently before approving, because each changes the
work rather than describing it:

1. **The two extra call sites are real.** `toolHrefsFor` is called at
   `PremiumV2CalculatorsIndexPage.tsx:23`, `PremiumV2EmiCalculatorPage.tsx:28`
   and `PremiumV2Home.tsx:178`. My analysis listed only `toolLinksFor`'s caller.
   The plan's file list supersedes mine.
2. **The `profile.yaml` `features:` collision is real and dangerous.** Line 80 of
   every profile holds `{reviews, pricing, awards, client_logos, team}`, consumed
   at `scripts/seed-client.ts:109` for **`firm_settings`**. Wiring
   `features: profile.features` into the `clients` upsert would write that object
   into the new column, every tenant would fall back to defaults, and a `select`
   would show a populated column. Excellent catch.
3. **`sitemapClients()` does `db.select()` — all columns**, so `features` arrives
   automatically and there is no third instance of the projection trap. Checked
   because two already exist.
4. **`clientSlug` is used at `FooterV2.tsx:64` only**, so removing the prop is
   correct rather than lossy.

### Rulings on Open Decisions

1. **Seed-script rename + comment — APPROVED, in scope.** This increment
   *creates* the collision by introducing a second `features` concept; leaving
   the trap armed for the next reader is not acceptable. Six local lines, the
   build typechecks it, and it makes the wrong move an unbound identifier rather
   than an autocomplete suggestion.
2. **No YAML key, no seed write — APPROVED.** The test is the right one and it is
   the same test CD-01 passed in the opposite direction: does omitting it
   introduce a regression? There it did; here it does not — `{}` is the correct
   answer for a new client, and the existing `onConflictDoUpdate` set block
   cannot null a live flag. The name collision settles any residual doubt. CD-09
   owns YAML-vs-DB truth.
3. **All five keys written explicitly on all five rows — APPROVED.** Self-
   describing rows, one `select` audits the whole matrix, and the migration does
   not silently depend on `FEATURE_DEFAULTS` being correct.
4. **`featureEnabled` returns the documented default for a null host —
   APPROVED.** It reproduces each old helper's `if (!clientSlug)` guard exactly,
   and one rule ("absent means default") beats two.
5. **These belong on the platform dashboard, not the tenant dashboard —
   APPROVED, and it is more than a placement preference.** `homeLoan` asserts a
   DSA relationship the operator must verify and `vastuSectors` can fail the
   deployment for every other tenant on it. A tenant admin flipping either is a
   compliance or an availability incident. I will carry this into CD-03's task
   file rather than leaving it for CD-03 to rediscover.

### Rulings on Architecture Conflicts

- **Conflict 1 (my call-site table was incomplete) — accepted.** Verified. 16
  files, not 13. The plan's table is authoritative.
- **Conflict 2 (`FeatureHost.features` required, not optional) — accepted, and
  this is the single most important line in the plan.** Optional, an un-widened
  `StaticParamTenant` satisfies it structurally and the home-loan gates compile
  into silence — the exact failure the widening exists to prevent. **Do not
  relax it, and do not accept a diff that does.**
- **Conflict 3 (AC 8 "byte-identical") — AC AMENDED.** The task file's wording
  was **my error**. `sitemapClients()` has no `ORDER BY` and this migration
  writes to every real-estate row, so a reshuffle is guaranteed. The bar is
  **sorted URL-set identity**, per CD-01's standing ruling. `task.md` is amended
  to match; a reordered file is not a regression.
- **Conflict 4 (hand-written backfill) — accepted**, resolved exactly as CD-01
  resolved it. The DDL is generated and unedited; the data statements are
  appended after `--> statement-breakpoint`. Not a violation.
- **Conflict 5 (`FeatureHost` rather than a bare `ClientFeatures`) — accepted.**
  The brief said "the tenant row (or a `ClientFeatures` object)"; passing the
  host is better and the reason is decisive — a bare `ClientFeatures` parameter
  is structurally satisfied by `{}` and by any object literal, which destroys the
  type gate that makes the compiler the checklist. The brief is overridden on
  this point; no further approval needed.

### Conditions

- **Sequence steps 3 → 6 are mandatory and not negotiable.** The projection
  widening lands before either home-loan gate is touched. If a gate does not
  compile, fix the projection, never the gate.
- **Do not enable `vastuSectors` on a second tenant, even briefly.** Toggle
  proofs use `propertyManagementPage` / `propertyMap` on
  `urban-flat-real-estate`. `high-properties` is never mutated.
- **Toggle proof C leaves `homeLoan` off for `urban-flat-real-estate` while it
  runs.** Restoring it is not optional and must be proven by the final `select`.
- CD-00 and CD-01 are complete and VERIFY_PASSed; nothing blocks the start.
