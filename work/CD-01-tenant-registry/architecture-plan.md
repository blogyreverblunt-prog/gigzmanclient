# ARCHITECTURE PLAN

## Work Item

CD-01 — Tenant registry moves from code to the database.

Move the client → template *assignment* off the hardcoded
`CLIENT_SLUG_TEMPLATE_MAP` in `lib/templates/index.ts` onto a new
`clients.template_key` column; keep `TEMPLATE_REGISTRY` (the catalogue of
templates that *exist*) in code; enforce `clients.isActive` in
`getTenantBySlug()`; reconcile the two comments this increment falsifies
(`lib/templates/index.ts`, `lib/domains.ts`).

Reference: `docs/client-dashboard-brief.md` §2 items 0A, 0B, 0D and §11.

## Expected Functional Outcome

**Nothing user-visible changes.** Every page of every tenant renders byte-for-byte
as it does today, with the same status codes and the same `data-template` value.

The outcome is structural: after this increment a `clients` row with
`vertical = 'realestate'` and `template_key = 'premium-v2'` produces a working
site with **no code edit and no deploy**. That is the precondition for CD-03's
create-client wizard.

Two behaviours *do* change, both deliberate and both required by the task:

1. `is_active = false` now makes a tenant's pages 404 (they previously still
   rendered on demand). This also 404s that tenant's `/dashboard` tree — see
   *Authorization*.
2. A `realestate` row whose `template_key` is null **or holds a value not in
   `TEMPLATE_REGISTRY`** 404s. The second half is new (previously an unknown
   value was impossible; now it is a database typo away) and is fail-closed by
   design.

## Affected Tenants

All six. **Global — not per-client gated.** This is tenant-resolution
infrastructure; there is no gating surface and none should be introduced.

| slug | vertical | `template_key` after migration | `is_active` |
|---|---|---|---|
| `high-properties` | realestate | `premium-v2` | true |
| `evergreen-real-estate` | realestate | `premium-v2` | true |
| `expert-realtors` | realestate | `premium-v2` | true |
| `nayra-realtors` | realestate | `premium-v2` | true |
| `urban-flat-real-estate` | realestate | `premium-v2` | true |
| `arora-k-associates` | cafirm (`is_demo: true`) | **NULL** | true |

The asymmetry is the risk profile: every tenant's *resolution path* changes and
no tenant's *output* may.

`urban-flat-real-estate` is the designated guinea pig for every destructive
evidence step (AC 6 and AC 7). Never `high-properties` — it is the live client.

## Existing Implementation

Verified by reading, not assumed.

- `lib/templates/index.ts:38` — `CLIENT_SLUG_TEMPLATE_MAP`, five hardcoded
  slugs. `getTemplateKeyForSlug(slug)` (line 46) reads it.
  `getTemplateUrlSlugForClientSlug(slug)` (line 56) is a second slug-keyed
  accessor wrapping the first; its **only** caller is `getTenantPath` at line 80.
- `lib/tenant.ts:51` — `getTenantBySlug()` returns `null` for a `realestate` row
  absent from the map. `lib/tenant.ts:93` — `getTenant()` compares the URL's
  template segment against the map. Neither checks `isActive`.
- `lib/tenant.ts:65` `basePathFor(tenant)` and `lib/templates/index.ts:78`
  `getTenantPath(vertical, clientSlug)` are **synchronous** and build every
  internal link, every canonical and every sitemap prefix.
- `getTemplateKeyForSlug` is referenced in **34 files / 37 call sites**
  (31 app files with 34 call sites — `builders/[slug]`, `(public)/layout.tsx` and
  `sectors/[sector]` have two each — plus `lib/sitemap.ts` ×1 and
  `lib/tenant.ts` ×2). The manager's count of 34 files is correct; the task
  file's "~20" was low.
- `getTenantPath` has exactly **3** call sites: `lib/tenant.ts:67`,
  `app/lookup-actions.ts:28`, `lib/sitemap.ts:104`. All three already hold the
  full `clients` row.
- `lib/sitemap.ts:70` `sitemapClients()` **already** filters `eq(clients.isActive, true)`.
  The sitemap half of AC 7 is already implemented — it must be *verified*, not built.
- `lib/static-params.ts:31` `activeTenants()` already filters `isActive`, and
  **projects only `{ id, slug }`**. This is the trap — see *Data Access*.
- Zero of the 34 files are Client Components (verified:
  `grep -rl getTemplateKeyForSlug … | xargs grep -l '"use client"'` returns nothing).

## Owning Modules

Ownership is preserved exactly; nothing crosses a boundary.

| Module | Role in this increment |
|---|---|
| `proxy.ts` | **Untouched.** Keeps `isTemplateUrlSlug()` (synchronous, DB-free). Its import list does not change by a single line. |
| `lib/templates/index.ts` | Owns `TEMPLATE_REGISTRY` (catalogue), `templateKeyFor()` (new accessor), `getTenantPath()`. No DB import, not even a type import. |
| `lib/tenant.ts` | Owns resolution. Gains the `isActive` guard; its template guard is re-sourced from the row. |
| `lib/db/schema.ts` | Owns the new column. |
| `lib/static-params.ts` | Owns the build-time tenant projection; widened so the two `generateStaticParams` gates keep working. |
| `lib/sitemap.ts` | Owns sitemap prefixes and family gating; two mechanical substitutions. |
| `lib/content.ts` | **Untouched.** No new read-side query. |
| `lib/actions/` | **Untouched.** No Server Action added or changed. |
| `components/` | **Untouched.** No component reads a template key; they receive `tenant` and call `basePathFor`. |
| `lib/domains.ts` | Comment only. No code change. |

## Dependencies

- CD-00 (build-worker connection exhaustion) must land first. Its fix is what
  makes AC 4's before/after prerendered-route counts measurable. Assume a green
  `pnpm build` exists at implementation time; if it does not, **stop and report**
  rather than substituting weaker evidence.
- No new packages. No new external service.

## Domain Models

One concept moves layers, and the split must stay crisp:

- **Template catalogue** — *"which templates can this codebase render?"*
  Answer lives in **code** (`TEMPLATE_REGISTRY`). Adding a template is a code
  change, because the components have to exist. `proxy.ts` depends on this being
  a synchronous, DB-free question.
- **Template assignment** — *"which template does this client render?"*
  Answer moves to **data** (`clients.template_key`). Assigning a template is a
  data change, because the client is data.

`templateKeyFor()` is the one place the two meet: it takes a data value and
returns it only if the catalogue recognises it.

## Database Changes

### Existing tables reused

`clients` — the only table touched. No other table is read or written.

### Tables changed/added

`clients`: one new column. No new table.

### Columns

In `lib/db/schema.ts`, inside `export const clients = pgTable("clients", {…})`,
placed immediately after `vertical` (position is cosmetic; drizzle-kit's diff
does not care):

```ts
  /**
   * Which template in `lib/templates` TEMPLATE_REGISTRY this tenant renders.
   *
   * Nullable because only `realestate` carries a template today — a `cafirm`
   * tenant has none, and null is the correct answer, not a missing value.
   * A `realestate` row with a null (or unrecognised) value 404s in
   * `getTenantBySlug`; it does not render untemplated under another client's
   * chrome.
   *
   * `varchar`, not a `pgEnum`: the valid set is the code-side registry, so
   * shipping a second template must not require a migration, and the check
   * belongs in `templateKeyFor()` where the registry lives. 60 chars matches
   * `vertical`.
   */
  templateKey: varchar("template_key", { length: 60 }),
```

- **Classification:** stable identity, set at create time. It is not editorial
  content, not observation history, and not per-request mutable state.
- **Tenant scope:** the column *is* the tenant row; there is no `clientId`
  scoping question. No query added anywhere reads `clients` unscoped by `slug`
  or `id`.
- **Mutability:** operator-editable (SQL today, CD-03's wizard later).
  **Not** editable from the tenant dashboard — changing it restyles and
  re-routes the whole site. Do not expose it in this increment.
- **Numeric precision:** N/A (no numeric column).

### Constraints

- **No unique constraint.** Many clients deliberately share one template; this
  is a many-to-one assignment, not an identity.
- **No `NOT NULL`.** Null is meaningful (cafirm), and a nullable column is what
  makes the migration safe against live rows.
- **No `CHECK` / no `pgEnum`.** The valid set is the code registry; validation is
  `templateKeyFor()`, which is fail-closed (`undefined` → 404).

### Indexes

**None.** State this explicitly so no one adds one: every read of `clients`
is by `slug` (already `.unique()`, so already indexed) or by `id` (PK).
`template_key` is never a query predicate — it is read off a row already fetched.
The one query that filters `clients` at all (`sitemapClients()`,
`activeTenants()`) filters on `is_active` across six rows.

### Relationships

No new FK. `clients.id` remains the parent of every content table via
`onDelete: "cascade"`, unchanged. `template_key` is a soft reference to a
code-side registry key, deliberately not a FK to a `templates` table — there is
no such table and creating one would be scaffolding a layer nothing needs
(`TEMPLATE_REGISTRY` has one entry).

### Migration strategy

Generated with `pnpm db:generate` → `drizzle/0006_<random>.sql` (last applied is
`0005_black_the_hand.sql`; `drizzle/meta/_journal.json` idx 5 → new idx 6).
Do **not** hand-write the DDL.

drizzle-kit does not generate data statements, so the backfill is appended by
hand to the generated file, after a `--> statement-breakpoint`. That is the
project's supported way to add a data step and does **not** violate the
"do not hand-write SQL" constraint, which is about the schema DDL.

The finished `drizzle/0006_*.sql` must be exactly:

```sql
ALTER TABLE "clients" ADD COLUMN "template_key" varchar(60);--> statement-breakpoint
-- CD-01 backfill. Correct only because premium-v2 is the sole entry in
-- TEMPLATE_REGISTRY at this point in history, so "every realestate tenant
-- renders premium-v2" is a true statement today. A future second template
-- must not copy this pattern — assign per client instead.
UPDATE "clients" SET "template_key" = 'premium-v2'
  WHERE "vertical" = 'realestate' AND "template_key" IS NULL;
```

Predicated on `vertical`, not on an explicit slug list: it backfills exactly the
five real-estate rows, is idempotent, and cannot silently leave a newly created
`realestate` row 404ing if one appears between now and the migration running.
(Rejected alternative: `WHERE slug IN (…five slugs…)` — brittle for exactly that
reason.)

**Safety against live rows:** the `ADD COLUMN` is nullable with no default, so it
takes no table rewrite and no long lock; the `UPDATE` touches five rows. Both are
forward-only and neither destroys data. `arora-k-associates` is untouched and
keeps NULL.

**Ordering is load-bearing:** run `pnpm db:migrate` **before** the new code
serves traffic. New code against a pre-migration database means `select()`
returns rows without `template_key`, `templateKeyFor()` returns `undefined`, and
every real-estate tenant 404s. Old code against a post-migration database is
harmless (the extra column is ignored). Migrate first, then deploy.

After migrating locally: the Postgres client is cached on `globalThis`, so the
dev server needs a **full restart**, not a hot reload.

## Data Access (lib/content.ts)

**`lib/content.ts` is not touched.** No new query, no new cached function, no
new cache key. Every one of the 37 substituted call sites reads a field off a
row it already has in hand — this increment adds **zero** database round trips.

Two read-side modules outside `lib/content.ts` do change:

**1. `lib/tenant.ts` — `lookupClientBySlug` (line 23) is unchanged.** It already
does `db.select()` (all columns), so `template_key` arrives automatically. Its
`unstable_cache` key parts (`["client-by-slug"]` + the `slug` argument) still
include every argument that varies the result, so **no key change is required or
permitted**. What *does* change is the cached payload's shape, which matters at
deploy time only — see *Caching and Revalidation*.

**2. `lib/static-params.ts` — `activeTenants()` projection must be widened.**
This is the single highest-value detail in the plan, because it is invisible
until it silently prerenders nothing.

`app/site/[tenant]/(public)/builders/[slug]/page.tsx:29` and
`sectors/[sector]/page.tsx:30` call the template gate **inside
`generateStaticParams`**, on the object `paramsForEachTenant` hands them — which
today is `{ id, slug }` only. `tenant.templateKey` does not exist there. A coder
who substitutes mechanically gets `undefined !== "premium-v2"` → `return []` →
both routes prerender **zero pages** while `pnpm build` still reports success.
This is failure mode #2 from the manager analysis, and it is prevented here:

```ts
/** What `generateStaticParams` needs about a tenant: enough to gate on its template. */
export type StaticParamTenant = {
  id: string;
  slug: string;
  vertical: string;
  templateKey: string | null;
};

export async function activeTenants(): Promise<StaticParamTenant[]> {
  try {
    const rows = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        vertical: clients.vertical,
        templateKey: clients.templateKey,
      })
      .from(clients)
      .where(eq(clients.isActive, true));
    return TENANT_ONLY.length > 0 ? rows.filter((r) => TENANT_ONLY.includes(r.slug)) : rows;
  } catch {
    return [];
  }
}

export async function paramsForEachTenant<T extends Record<string, string>>(
  rowsFor: (tenant: StaticParamTenant) => Promise<T[]>,
): Promise<({ tenant: string } & T)[]> { /* body unchanged */ }
```

The widening is purely additive: the other 12 `paramsForEachTenant` callers and
`app/site/[tenant]/layout.tsx:20` use only `id`/`slug` and keep compiling
untouched. The `isActive` filter and the `TENANT_ONLY` narrowing stay exactly as
they are.

## Server Actions (lib/actions/)

**None added, none changed.** `lib/actions/dashboard-actions.ts` and
`lib/actions/submit-query.ts` do not read a template key and are out of scope.

`app/lookup-actions.ts` is a Server Action and *is* touched, but only at its
`getTenantPath` call — no auth, ownership or query change:

```ts
  redirect(getTenantPath(client));   // was: getTenantPath(client.vertical, client.slug)
```

Its `!client.isActive` guard at line 24 stays exactly as it is; it is a separate,
already-correct enforcement point and duplicating it into a shared helper is not
this increment's job.

## Routes

No route is added, removed, renamed or re-parameterised. 31 app files under
`app/site/[tenant]/` change one or two expressions each. The complete list, with
line numbers as they stand today:

| File (under `app/site/[tenant]/`) | Call site line(s) |
|---|---|
| `(public)/layout.tsx` | 100, 109 |
| `(public)/area-converter/page.tsx` | 34 |
| `(public)/area-converter/[pair]/page.tsx` | 56 |
| `(public)/builders/page.tsx` | 36 |
| `(public)/builders/[slug]/page.tsx` | **29 (generateStaticParams)**, 58 |
| `(public)/calculators/page.tsx` | 37 |
| `(public)/calculators/[key]/page.tsx` | 55 |
| `(public)/contact/page.tsx` | 31 |
| `(public)/faq/page.tsx` | 113 |
| `(public)/firm-profile/page.tsx` | 45 |
| `(public)/legal/[slug]/page.tsx` | 29 |
| `(public)/localities/page.tsx` | 45 |
| `(public)/localities/[slug]/page.tsx` | 59 |
| `(public)/maps/gurgaon/page.tsx` | 40 |
| `(public)/maps/gurgaon/[area]/page.tsx` | 59 |
| `(public)/properties/loading.tsx` | 8 |
| `(public)/properties/page.tsx` | 42 |
| `(public)/properties/[slug]/page.tsx` | 108 |
| `(public)/property-management/page.tsx` | 49 |
| `(public)/rental-yield/page.tsx` | 32 |
| `(public)/rental-yield/[corridor]/page.tsx` | 45 |
| `(public)/sectors/page.tsx` | 36 |
| `(public)/sectors/[sector]/page.tsx` | **30 (generateStaticParams)**, 55 |
| `(public)/updates/page.tsx` | 33 |
| `(public)/updates/[slug]/page.tsx` | 47 |
| `(public)/vastu/page.tsx` | 35 |
| `(public)/vastu/[topic]/page.tsx` | 236 |
| `(public)/vastu/gurugram/page.tsx` | 37 |
| `(public)/vastu/gurugram/[sector]/page.tsx` | 52 |
| `(public)/vastu/gurugram/[sector]/[aspect]/page.tsx` | 61 |
| `dashboard/layout.tsx` | 29 |

**The 27 mechanical ones.** Every site of the form
`getTemplateKeyForSlug(tenant.slug)` where `tenant` is a resolved row becomes
`templateKeyFor(tenant)`, and the import changes from
`import { getTemplateKeyForSlug } from "@/lib/templates";` to
`import { templateKeyFor } from "@/lib/templates";`. Because `templateKeyFor`
returns the **identical type** (`TemplateKey | undefined`) that
`getTemplateKeyForSlug` returns today, every `=== "premium-v2"` /
`!== "premium-v2"` comparison and every JSX use is provably type-equivalent, and
`pnpm build` catches any that is not. Do not "simplify" these to a raw
`tenant.templateKey !== "premium-v2"` — see *Architecture Conflicts*.

**The 7 that need attention.**

1. **`(public)/layout.tsx:100,109` — highest severity.** Two calls, one of which
   emits `data-template`, which selects the tenant's entire palette via
   `[data-vertical="realestate"][data-template="premium-v2"]` in
   `app/globals.css:128`. A wrong value here restyles a whole tenant with no
   error. Collapse to one lookup so the two can never diverge:

   ```ts
   const templateKey = templateKeyFor(tenant);
   const isPremiumV2 = templateKey === "premium-v2";
   …
       data-template={templateKey}
   ```
   `templateKey` is `TemplateKey | undefined`; React omits the attribute for
   `undefined`, which is exactly today's behaviour for `arora-k-associates`.
   Do not coerce it to `""` or to `tenant.templateKey`.

2. **`dashboard/layout.tsx:29`** — same attribute on the dashboard tree, one
   call: `"data-template": templateKeyFor(tenant)`.

3. **`builders/[slug]/page.tsx:29`** and **4. `sectors/[sector]/page.tsx:30`** —
   the `generateStaticParams` gates. `templateKeyFor(tenant)` compiles here
   **only** because `activeTenants()` was widened above. If it does not compile,
   the widening was missed — fix the projection, never the gate.

5. **`properties/loading.tsx:8`** — gets its tenant from `getTenant()`, i.e.
   `headers()`, inside a `(public)` route. **Pre-existing; out of scope to fix.**
   The substitution is `templateKeyFor(tenant)` where `tenant` is the
   `Tenant | null` it already holds — so `templateKeyFor` must accept
   `null | undefined`, which it does. This is provably **not worse**: the file
   already calls `getTenant()` and already dereferences `tenant?.slug`, so
   reading a second field off the same row adds no `headers()` call, no query and
   no dynamic API. Note for a later increment: this file could take its tenant
   from `params` like every sibling; not here.

6. **`lib/sitemap.ts:264`** — `templateKeyFor(client)` on a row already in hand.
   While in the file, merge the duplicate `@/lib/templates` imports at lines 6
   and 9 into one.

7. **`lib/tenant.ts:51,93`** — the resolution guards. See below.

`lib/tenant.ts` after the change (the two guards, verbatim intent):

```ts
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  const row = await lookupClientBySlug(slug);
  if (!row) return null;

  // An inactive tenant is off the air, not merely unlisted. `activeTenants()`
  // already keeps it out of the build and `sitemapClients()` out of the
  // sitemap, but until CD-01 its pages still rendered on demand — so the
  // Active switch CD-03 exposes would have done nothing. This is the
  // enforcement point for both the public tree and the tenant dashboard,
  // because both resolve through here.
  if (!row.isActive) return null;

  // Same DB-verified guard the header path applies: a real-estate client must
  // actually be assigned a template the code can render, so a wrong template
  // segment — or a null/unrecognised `template_key` — 404s rather than
  // rendering the client under foreign chrome.
  if (row.vertical === "realestate" && !templateKeyFor(row)) return null;

  return row;
});
```

Order matters: `isActive` is checked **first**, so a deactivated tenant 404s for
the same reason regardless of its template.

In `getTenant()` (line 93): `const clientTemplateKey = templateKeyFor(row);`.
`getTenant()` deliberately does **not** gain an `isActive` check — see
*Open Decisions*.

## Rendering Strategy

Unchanged for every route, and that is the acceptance bar.

- Public pages continue to take the tenant from `params` via
  `getTenantBySlug(params.tenant)`. **No page gains a `headers()` call**, so no
  page is forced into dynamic rendering. `templateKeyFor()` is a pure function
  over a value the page already has — it reads no dynamic API.
- `generateStaticParams` return shapes are unchanged. Every nested dynamic route
  still returns the complete param set including the ancestor `tenant`, because
  `paramsForEachTenant` still spreads `{ tenant: tenant.slug, ...row }`. Only the
  *type* of the object handed to the callback widens.
- `app/site/[tenant]/layout.tsx` still enumerates tenants from
  `activeTenants()` → `{ tenant: slug }` for the five+one active rows.
- `export const revalidate = 300` on `builders/[slug]` and `sectors/[sector]`
  stays; the "no `force-static`" comments in both files stay untouched.
- The accessor stays **synchronous**. `basePathFor()` and `getTenantPath()`
  remain synchronous, so the entire internal-link layer — including the
  `components/realestate/premium-v2/*` components that call `basePathFor(tenant)`
  — is untouched. An async accessor would cascade into Client Components and is a
  failed design here.

## Caching and Revalidation

- **No cache key changes.** `lookupClientBySlug`'s `unstable_cache` key parts
  (`["client-by-slug"]` + the `slug` argument) already include every argument
  that varies the result. Nothing else in this increment is cached.
- **No `revalidatePath` / `revalidateTag` calls are added**, because no Server
  Action in this increment writes anything.
- **Deploy-time hazard, stated so it is not mistaken for a bug:** the cached
  payload *shape* changes (rows now carry `templateKey`). A cache entry written
  by pre-change code and read by post-change code yields
  `templateKey === undefined` → `templateKeyFor()` → `undefined` → a real-estate
  tenant 404s until the entry expires (≤ 300s). This is fail-closed, not
  fail-wrong: the tenant 404s, it never renders under the wrong chrome. In
  practice a new deployment id invalidates the data cache; locally, if a tenant
  404s immediately after implementing, `rm -rf .next` and restart the dev server
  before investigating anything else.
- **What `revalidate: 300` means for `is_active` (task constraint 5):** an
  operator flipping `is_active` directly in SQL sees no effect for **up to 300
  seconds**, plus any route-level cache. This increment **documents** that window;
  it does **not** add revalidation, and the window is **not** a defect to file.
  It matters twice:
  - *Evidence gathering* — every AC 6 / AC 7 step must stop the dev server,
    `rm -rf .next`, run the SQL, then start the dev server. That makes the result
    deterministic instead of racing a 5-minute window.
  - *CD-03* — when the dashboard exposes an Active switch, that Server Action must
    invalidate this cache. Deliberately **not** pre-wired here (no tag is added to
    `lookupClientBySlug`): a cache tag nothing calls is scaffolding a future layer.
    Recorded in *Open Decisions*.

## Per-Client Gating

**None. This change is global by construction.** No `Set<string>` of slugs is
added, no per-client branch is introduced, and none of the five existing
code-side toggles (`lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`,
`lib/home-loan/enabled.ts`, `lib/premium-v2/positioning.ts`) is touched — those
are CD-02's problem.

The one thing that *becomes* per-client data is the template assignment itself,
and it lives on the row where it belongs.

## Content / YAML Changes

Two changes, both narrow and both required for this increment to finish its own
job rather than leave a hole behind it.

**1. `clients/<slug>/profile.yaml` — five files gain one line.** In
`high-properties`, `evergreen-real-estate`, `expert-realtors`, `nayra-realtors`,
`urban-flat-real-estate`, immediately after the existing `vertical: realestate`
line:

```yaml
template: premium-v2
```

`arora-k-associates/profile.yaml` gets **nothing** (cafirm has no template).

**`_status`:** none, and that is deliberate. `_status` marks *claims about the
business* — address, phone, hours, registration numbers — so they can be audited
as `verified` / `placeholder` / `pending`. `template` is deployment
infrastructure, not a client fact; it is in the same class as `slug` and
`vertical`, neither of which carries `_status` either. **No client fact is
invented and no field renders anything.** RERA and ICAI constraints are
untouched: no listing, disclosure or testimonial surface changes, and
`reviewsEnabled` is not read by this increment.

**2. `scripts/seed-client.ts` — the clients upsert (lines 62–77).** Without this,
`pnpm seed:client <new-slug>` — the only supported way to create a tenant today —
produces a row with `template_key = NULL`, i.e. a 404ing site. That regression
would be *introduced by this increment*, so fixing it is in scope, not scope
creep. Exactly:

```ts
    .values({
      slug: profile.slug,
      vertical: profile.vertical ?? "cafirm",
      displayName: profile.display_name,
      isDemo: profile.is_demo ?? false,
      // The template assignment lives on the row since CD-01; `profile.template`
      // is the bootstrap value for it. A realestate client seeded without one
      // 404s — see getTenantBySlug.
      templateKey: profile.template ?? null,
    })
    .onConflictDoUpdate({
      target: clients.slug,
      set: {
        displayName: profile.display_name,
        vertical: profile.vertical ?? "cafirm",
        isDemo: profile.is_demo ?? false,
        // Written only when the YAML actually names one, so re-seeding a client
        // whose profile.yaml predates this field cannot null out a live
        // assignment.
        ...(profile.template ? { templateKey: profile.template as string } : {}),
      },
    })
```

**3. Documentation that this increment falsifies.** `AGENTS.md` "Adding a
tenant" step 2 ("Register the slug in `lib/templates/index.ts` →
`CLIENT_SLUG_TEMPLATE_MAP`") and `README.md` ("registering the slug in
`lib/templates/index.ts`") both instruct the reader to edit a symbol this
increment deletes. Both must be rewritten to: *set `template: premium-v2` in
`profile.yaml`* (which `pnpm seed:client` writes to `clients.template_key`). This
is the same defect class item 6 exists to prevent — a comment contradicting the
code — and leaving it is not acceptable.

`AGENTS.md`'s trailing note under "Adding a tenant" —
"Custom domain additionally needs `lib/domains.ts` → `HOST_TENANT_MAP`, kept in
step with `clients.customDomain` (the sitemap reads the column)" — carries the
same false claim as the `lib/domains.ts` comment and must be corrected to match
the rewritten comment below.

## The two comment rewrites (task items 5 and 6)

These are deliverables, not decoration. Each existing comment records a decision
*and* its rejected alternative; each replacement must record the **new** decision
and **why the old one was overturned**, and must contradict nothing in the code.

### `lib/templates/index.ts` (replaces lines 1–13)

Must state, in the module's existing comment density:

- What the module now is: the **catalogue** of templates that exist, plus the URL
  segment each is addressed by.
- What it no longer is: `CLIENT_SLUG_TEMPLATE_MAP` was a hardcoded slug →
  template object, justified on the grounds that a slug-keyed map was enough
  "for the one real client" without a migration.
- **Why that was overturned:** it stopped being true twice over — there are five
  real-estate tenants, and a client absent from the map does not render
  untemplated, it **404s** (`lib/tenant.ts` `getTenantBySlug`). Onboarding a
  client therefore required a code edit and a deploy, which made a dashboard that
  *creates* clients impossible. CD-01 moved the assignment to
  `clients.template_key`; the row is the source of truth.
- **What stays and why:** `TEMPLATE_REGISTRY` is the set of templates the code
  can actually render, and `proxy.ts` calls `isTemplateUrlSlug()` on every
  request. `proxy.ts` must stay database-free — it runs on every page view, the
  functions run in `bom1` and the pooler is in `ap-southeast-2`, so a lookup there
  would tax every request with a cross-region round trip.
- The resulting split, in one line: **adding a template is a code change;
  assigning one to a client is a data change.**

### `lib/domains.ts` (replaces lines 1–16)

Must state:

- What the map is for (unchanged first paragraph: host mode, one client's own
  domain serving at the root).
- **The correction:** it is a static map *not* because `proxy.ts` "runs as edge
  middleware and cannot reach the database" — that claim is false and contradicts
  `proxy.ts`'s own header comment, which says Next 16 runs it on Node — but
  because it *must not*: `proxy.ts` runs on every single request, `bom1` →
  `ap-southeast-2`, so a lookup there taxes every page view with a cross-region
  round trip. (`docs/client-dashboard-brief.md` §11 lists adding a DB read to
  `proxy.ts` as a decision no agent may make alone.)
- **What `HOST_TENANT_MAP` actually is:** a per-deployment convenience. A
  host-mode deployment serves exactly one client, so `PRIMARY_HOST_TENANT`
  (`PRIMARY_TENANT_SLUG`) is the real mechanism; without it set, an unmapped
  hostname resolves to no tenant and every path 404s.
- **Where `clients.custom_domain` really stands:** it is the source of truth for
  *which host resolves to a tenant* — read by `lib/tenant.ts`'s host fallback and
  `lib/actions/submit-query.ts` — and, **in path mode only**, the absolute prefix
  `lib/sitemap.ts prefixFor()` uses. It is deliberately **not** the canonical
  origin in host mode: `lib/sitemap.ts:89` and `lib/og.ts:80` both prefer
  `NEXT_PUBLIC_SITE_URL` there, with their reasons already written out.
- **Delete the instruction "keep the two in step."** It is the false sentence
  the task asks to reconcile, and it is false in both directions.
- Correct the stale claim that the preview `*.vercel.app` hostname "is included"
  in the map — it is not in the map; it reaches the tenant through
  `PRIMARY_HOST_TENANT`.

### Finding on the drift itself (report, do not fix here)

`custom_domain` is NULL for all six rows, including `high-properties`, whose
domain the map names. **This is not a live SEO defect**, for two reasons that had
to be read out of the code:

1. `lib/sitemap.ts prefixFor()` short-circuits on `HOST_MODE` and returns
   `siteOrigin()` **before** it ever looks at `client.customDomain`. The live
   client site runs `TENANT_MODE=host`, so the column is never consulted for its
   sitemap. `lib/og.ts originFor()` short-circuits the same way for
   `metadataBase`.
2. On the shared path-mode deployment, NULL yields
   `${siteOrigin()}${getTenantPath(client)}` — the path-prefixed URL, which is
   the correct absolute URL for that deployment. Populating the column there
   would actually *break* it, by advertising a domain that deployment does not
   serve.

The two code paths NULL does disable are `lib/tenant.ts:102` (the `x-tenant-host`
fallback) and `lib/actions/submit-query.ts:59` (the `tenantHost` branch) — both
effectively unreachable, because in host mode `proxy.ts` always sets `x-tenant`
from `tenantSlugForHost()`, and when it cannot it returns `next()` without a
rewrite so the request 404s before reaching either.

**Verdict: report only.** Populating `custom_domain` belongs to CD-03 (brief §2
item 0B step 1, "make `clients.customDomain` editable from the dashboard"), not
here. Do not write to the column in this increment.

## Authorization

No change to either auth system. `lib/platform-auth.ts`, `lib/auth.ts`,
`assertOwnership` and the `gz_platform_session` / `gz_session` cookies are
untouched.

One consequence must be recorded rather than discovered: `getTenantBySlug` gates
**both** `app/site/[tenant]/(public)/` and `app/site/[tenant]/dashboard/`, so
`is_active = false` also 404s that tenant's dashboard and its dashboard login.
That is defensible — an off-air tenant should not be editable by its own staff —
and it is not a lock-out, because reactivation is an operator action (SQL today,
CD-03's platform dashboard later), never a tenant action. Say so in the comment
on the guard. Flagged in *Open Decisions* for CD-03 to confirm.

## Tenant Isolation

Unaffected and unweakened.

- No query added anywhere. The only queries in scope (`lookupClientBySlug`,
  `activeTenants`, `sitemapClients`) are `clients`-table queries scoped by `slug`
  or filtered by `is_active`, exactly as today — `clients` is the tenant registry
  itself, so `clientId` scoping does not apply to it.
- Not one content query changes, so every `clientId`-scoped read in
  `lib/content.ts` stays exactly as it is.
- Isolation is **strengthened** in one place: an unrecognised `template_key` now
  fails closed to a 404 instead of being impossible-by-construction, so a
  database typo cannot render a tenant under another template's chrome.

## Failure Behaviour

| Condition | Behaviour | Where |
|---|---|---|
| `realestate` row, `template_key` NULL | 404 | `getTenantBySlug` |
| `realestate` row, `template_key` not in `TEMPLATE_REGISTRY` | 404 (new, fail-closed) | `templateKeyFor` → `getTenantBySlug` |
| `cafirm` row, `template_key` NULL | renders normally, `data-template` attribute omitted | unchanged |
| `is_active = false` | 404 on public **and** dashboard; absent from sitemap; not prerendered | `getTenantBySlug`, `sitemapClients`, `activeTenants` |
| Unknown template URL segment (`/realestate/temp-luxury-showcase/…`) | redirect to `/` | `proxy.ts:103`, unchanged |
| Database unreachable at build time | `activeTenants()` returns `[]`; routes fall back to on-demand; build does not fail | `lib/static-params.ts` catch, unchanged |
| Database unreachable at sitemap time | `sitemapClients()` returns `[]`; empty sitemap | `lib/sitemap.ts` catch, unchanged |
| New code, pre-migration database | every realestate tenant 404s | migrate first (see *Migration strategy*) |

Nothing throws where it previously 404'd, and nothing 404s where it previously
threw.

## SEO and Indexing Impact

**Target: zero change.** Every sitemap URL, canonical and JSON-LD block must be
byte-identical before and after — that is a graded evidence item, not an
assumption.

- **Canonicals** are built from `joinPath(basePathFor(tenant), path)`.
  `basePathFor` → `getTenantPath(tenant)`, which returns the same string as
  before for all six tenants because the row's `template_key` equals what the map
  said.
- **Sitemap:** `prefixFor(client)` and `registerEntries()`'s gate change shape,
  not output. `sitemapClients()` already excludes inactive tenants — so AC 7's
  sitemap half is **verified**, not implemented.
- **JSON-LD:** `buildOrganizationJsonLd(settings, basePath || "/", …)` takes the
  same `basePath`. Unchanged.
- **robots:** untouched. `dashboard/layout.tsx` keeps its
  `robots: { index: false, follow: false }`.
- **`metadataBase`:** `originFor(row?.customDomain)` — untouched, and the NULL
  `custom_domain` finding above changes nothing about it.
- **New indexing behaviour:** a deactivated tenant now 404s *and* is out of the
  sitemap, so it is properly de-indexable. Previously it was out of the sitemap
  but still served 200s — a soft, invisible index leak. This is an improvement,
  and it is the only intentional SEO-visible change.

## Analytics

No change. The per-tenant gtag.js snippet stays in
`app/site/[tenant]/(public)/layout.tsx` under the same condition; no event, no
property and no measurement id is touched.

## Evidence Required

There is no test suite. Every item below is a command with an expected result.
Record actual output, not a summary.

**Order is mandatory:** capture the baseline on a clean tree *before* migrating
or editing anything.

### Build

1. **Baseline, on the unmodified tree** (requires CD-00's fix in place):

   ```bash
   pnpm build 2>&1 | tee work/CD-01-tenant-registry/build-before.txt
   node -e "const m=require('./.next/prerender-manifest.json');const c={};for(const r of Object.keys(m.routes||{})){if(!r.startsWith('/site/'))continue;const s=r.split('/')[2];c[s]=(c[s]||0)+1}console.log(JSON.stringify(c,null,2))" \
     | tee work/CD-01-tenant-registry/prerendered-before.json
   ```

   Fallback if Next 16.3.3's manifest shape differs — version-agnostic, counts
   prerendered HTML straight off disk:

   ```bash
   find .next/server/app/site -name '*.html' | sed 's|.*/site/||' | cut -d/ -f1 | sort | uniq -c
   ```

2. **After implementing:** the same two commands into `build-after.txt` /
   `prerendered-after.json`, then:

   ```bash
   diff work/CD-01-tenant-registry/prerendered-before.json work/CD-01-tenant-registry/prerendered-after.json
   ```

   **Expected: no output.** A per-tenant count that drops — for any of the six —
   is a **failure**, not a detail. Report both JSON files in full in the
   implementation report; "the build is green" is not evidence for AC 4.
   Pay particular attention to `high-properties`, which owns most of the
   `builders/*` and `sectors/*` pages the two `generateStaticParams` gates
   produce; a silent regression there is the expected shape of failure mode #2.

3. **The build is the typecheck.** `pnpm build` completing is AC 3's proof that
   no call site became `async` — an `await`-less `Promise<TemplateKey>` compared
   to `"premium-v2"` does not typecheck.

### Rendered pages (per tenant)

Dev server on `localhost:3000`, `TENANT_MODE=path`. For each of the six tenants,
with `P=/realestate/temp-premium-v2/<slug>` (or `/cafirm/arora-k-associates`):

```bash
for u in "" /properties /services /contact; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$P$u")" "$P$u"
done
```

Run the whole sweep **before** and **after** and diff the two outputs.

Expected status codes (identical before and after):

| Route | 5 × realestate | `arora-k-associates` |
|---|---|---|
| home | 200 | 200 |
| `/properties` | 200 | **404** (real-estate-only route; the gate proving it still gates) |
| `/services` | 200 | 200 |
| `/contact` | 200 | 200 |

**`data-template` — the direct check for the highest-severity failure mode:**

```bash
curl -s "http://localhost:3000/realestate/temp-premium-v2/high-properties" | grep -o 'data-template="[^"]*"' | head -1
# expected: data-template="premium-v2"   (same for all five realestate tenants)
curl -s "http://localhost:3000/cafirm/arora-k-associates" | grep -o 'data-template="[^"]*"' | head -1
# expected: no output — the attribute is omitted, exactly as today
curl -s "http://localhost:3000/cafirm/arora-k-associates" | grep -o 'data-vertical="[^"]*"' | head -1
# expected: data-vertical="cafirm"
```

**Identifying element** (AC 5, "the same rendered template"): for
`high-properties` grep for `gp-container` (the Premium-V2 primitive class); for
`arora-k-associates` confirm `gp-container` is **absent** and `data-vertical="cafirm"`
present. Same result before and after.

**Sitemap byte-equality** — one cheap command that covers all six tenants and
every family at once:

```bash
for f in core properties register localities updates services; do
  curl -s "http://localhost:3000/sitemaps/$f.xml" > "/tmp/$f-before.xml"; done
# …implement…
for f in core properties register localities updates services; do
  curl -s "http://localhost:3000/sitemaps/$f.xml" > "/tmp/$f-after.xml"
  diff "/tmp/$f-before.xml" "/tmp/$f-after.xml"; done
# expected: no output from any diff
```

**Negative cases.** Record before **and** after; the bar is that they **match**,
not that they hit a particular code:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/realestate/temp-luxury-showcase/high-properties   # expect 307/308 -> /
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/site/high-properties                              # expect 307/308 -> /
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/cafirm/high-properties
```

Note on the third: the task's evidence list expects 404, but public pages resolve
through `getTenantBySlug(params.tenant)`, which has no URL vertical to compare
against — only the header-based `getTenant()` performs that check. It may well
return 200 today. **Record the actual before value and require the after value to
equal it.** If it is 200, that is a pre-existing duplicate-URL observation for a
later increment (self-correcting canonicals: `basePathFor` returns the correct
`/realestate/temp-premium-v2/...` prefix from the row either way) — report it, do
not fix it here.

### Database checks

```bash
psql "$DATABASE_URL" -c "select slug, vertical, template_key, is_active from clients order by slug;"
```

Expected exactly six rows: the five real-estate slugs with `template_key =
premium-v2` and `is_active = t`; `arora-k-associates` with `template_key` NULL
and `is_active = t`. (AC 1.)

```bash
psql "$DATABASE_URL" -c "\d clients" | grep template_key
# expected: template_key | character varying(60) |  (nullable, no default)
```

**AC 6 — realestate row with a null template 404s.** Stop the dev server,
`rm -rf .next` (defeats the 300s `unstable_cache` window deterministically), then:

```bash
psql "$DATABASE_URL" -c "update clients set template_key = null where slug = 'urban-flat-real-estate';"
pnpm dev &   # then:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate   # expect 404
psql "$DATABASE_URL" -c "update clients set template_key = 'premium-v2' where slug = 'urban-flat-real-estate';"
# stop server, rm -rf .next, restart
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate   # expect 200
```

Also verify the fail-closed half by setting `template_key = 'premium-v3'` and
confirming 404, then restoring.

**AC 7 — the `is_active` cycle**, same stop / `rm -rf .next` / restart discipline
around each SQL statement:

```bash
psql "$DATABASE_URL" -c "update clients set is_active = false where slug = 'urban-flat-real-estate';"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate   # expect 404
curl -s http://localhost:3000/sitemaps/core.xml | grep -c urban-flat-real-estate                                   # expect 0
psql "$DATABASE_URL" -c "update clients set is_active = true where slug = 'urban-flat-real-estate';"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate   # expect 200
curl -s http://localhost:3000/sitemaps/core.xml | grep -c urban-flat-real-estate                                   # expect > 0
```

Leave the database in the six-row state of the table above. Confirm it with a
final `select`.

### Content checks

```bash
# AC 2 — the map and the old accessor are gone from the repo, entirely.
grep -rn "CLIENT_SLUG_TEMPLATE_MAP\|getTemplateKeyForSlug\|getTemplateUrlSlugForClientSlug" \
  --include=*.ts --include=*.tsx . | grep -v node_modules
# expected: no output

# AC 3 — no Client Component performs the lookup.
grep -rl "templateKeyFor" --include=*.ts --include=*.tsx . | grep -v node_modules \
  | xargs grep -l '"use client"'
# expected: no output

# AC 3 — the accessor is synchronous and no call site awaits it.
grep -rn "await templateKeyFor\|async function templateKeyFor" --include=*.ts --include=*.tsx . \
  | grep -v node_modules
# expected: no output

# AC 8 — proxy.ts still has no database import. Its import list must be
# byte-identical to before.
sed -n '1,6p' proxy.ts
git diff --stat proxy.ts     # expected: no change at all

# The five profile.yaml files carry the bootstrap value; the cafirm one does not.
grep -rn "^template:" clients/*/profile.yaml
# expected: exactly 5 lines, all "template: premium-v2", none under arora-k-associates

# Seeding round-trip: re-seed one client and confirm the assignment survives.
pnpm seed:client urban-flat-real-estate --force
psql "$DATABASE_URL" -c "select slug, template_key from clients where slug = 'urban-flat-real-estate';"
# expected: premium-v2
```

**AC 9 — the two rewritten comments.** Read both back and confirm, in the
implementation report, that each states the current reasoning and contradicts
nothing in the code. Specifically: `lib/domains.ts` no longer says `proxy.ts`
"cannot reach the database", no longer says "keep the two in step", and no longer
claims the `*.vercel.app` hostname is in the map; `lib/templates/index.ts` no
longer says the map is "deliberately slug-keyed rather than a
`clients.templateKey` DB column". Plus:

```bash
grep -rn "CLIENT_SLUG_TEMPLATE_MAP\|edge middleware\|keep the two in step" AGENTS.md README.md docs/ lib/ 2>/dev/null
# expected: no output outside docs/client-dashboard-brief.md (a historical brief, not edited)
```

## Expected Files / Modules

**Schema and migration (3–4 files)**
- `lib/db/schema.ts` — one column on `clients`.
- `drizzle/0006_<generated>.sql` — generated, plus the hand-appended backfill.
- `drizzle/meta/_journal.json`, `drizzle/meta/0006_snapshot.json` — generated.

**Core logic (4 files)**
- `lib/templates/index.ts` — rewrite the header comment; delete
  `CLIENT_SLUG_TEMPLATE_MAP`, `getTemplateKeyForSlug` and
  `getTemplateUrlSlugForClientSlug`; add `templateKeyFor`; change `getTenantPath`
  to take the row. Keep `TEMPLATE_REGISTRY`, `URL_SLUG_TO_KEY`,
  `getTemplateConfig`, `isTemplateUrlSlug`, `getTemplateKeyForUrlSlug` exactly
  as they are.
- `lib/tenant.ts` — `isActive` guard; both template guards re-sourced; import
  swap.
- `lib/static-params.ts` — widen `activeTenants()`'s projection; export
  `StaticParamTenant`.
- `lib/sitemap.ts` — line 264 substitution, line 104 `getTenantPath(client)`,
  merge the duplicate `@/lib/templates` imports.

**Call sites (32 files)**
- `app/lookup-actions.ts` — `getTenantPath(client)`.
- The 31 files listed under *Routes*.

**Seed path and docs (8 files)**
- `scripts/seed-client.ts`
- `clients/{high-properties,evergreen-real-estate,expert-realtors,nayra-realtors,urban-flat-real-estate}/profile.yaml`
- `AGENTS.md` ("Adding a tenant" step 2 + the custom-domain note)
- `README.md` ("Add one by…")

**Comment only (1 file)**
- `lib/domains.ts`

**Explicitly NOT touched:** `proxy.ts`, `lib/content.ts`, `lib/actions/**`,
`components/**`, `app/globals.css`, `lib/verticals/**`, `lib/premium-v2/**`,
`lib/og.ts`, `lib/db/index.ts`, `docs/client-dashboard-brief.md`,
`scripts/dry-run.ts`.

## Implementation Sequence

1. **Capture the build baseline on the clean tree** — `build-before.txt` and
   `prerendered-before.json`. Also capture the six-tenant status sweep and the
   six sitemap XML files. Nothing else may be edited until these exist.
2. **Schema + migration:** add the column to `lib/db/schema.ts`,
   `pnpm db:generate`, append the backfill `UPDATE` to the generated
   `0006_*.sql`, `pnpm db:migrate`, verify with the `select`. Restart the dev
   server (globalThis-cached Postgres client).
3. **`lib/templates/index.ts`:** add `templateKeyFor`, change `getTenantPath`,
   delete the map and the two dead slug-keyed accessors, rewrite the header
   comment. The build now breaks loudly at every call site — that is the
   checklist.
4. **`lib/static-params.ts`:** widen the projection **before** touching
   `builders/[slug]` or `sectors/[sector]`, so those two gates typecheck instead
   of silently compiling against a missing field.
5. **`lib/tenant.ts`:** both guards plus the `isActive` check.
6. **`lib/sitemap.ts` and `app/lookup-actions.ts`:** the `getTenantPath` and
   `templateKeyFor` substitutions.
7. **The 31 app files.** Do the three attention cases first
   (`(public)/layout.tsx`, `dashboard/layout.tsx`, `properties/loading.tsx`),
   then the mechanical remainder. `pnpm build` after this step must be green.
8. **`lib/domains.ts` comment rewrite.**
9. **Seed path:** `scripts/seed-client.ts` + the five `profile.yaml` files.
10. **Docs:** `AGENTS.md` and `README.md`.
11. **Evidence:** the after-build, the manifest diff, the page sweep diff, the
    sitemap diffs, the AC 6 and AC 7 cycles, the grep checks. Restore the
    database to its six-row state and prove it.

## Acceptance Criteria Mapping

| AC | Satisfied by | Evidence |
|---|---|---|
| 1. Column exists, nullable, five backfilled | Schema + `0006_*.sql` backfill | `select … from clients`; `\d clients` |
| 2. `CLIENT_SLUG_TEMPLATE_MAP` gone everywhere | `lib/templates/index.ts` deletion | the AC-2 grep returns nothing |
| 3. Accessor synchronous; no call site async; no Client Component lookup | `templateKeyFor` is a plain function over a value; `getTenantPath`/`basePathFor` stay sync | `pnpm build` green + the two AC-3 greps |
| 4. Build green, per-tenant prerendered counts match | Widened `activeTenants()` keeps both `generateStaticParams` gates working | `diff prerendered-before.json prerendered-after.json` → empty |
| 5. Four routes per tenant: same status, same template | Row value equals the map value for all six | status sweep diff + `data-template` + `gp-container` checks |
| 6. `template_key = null` realestate row 404s | `getTenantBySlug` guard sourced from the row | the AC-6 cycle, plus the `premium-v3` fail-closed case |
| 7. `is_active = false` → 404 and out of the sitemap; reversible | New guard in `getTenantBySlug`; `sitemapClients()` already filters | the AC-7 cycle, both directions |
| 8. `proxy.ts` has no database import | Not touched; `templateKeyFor` uses a structural type, no schema import | `git diff --stat proxy.ts` shows no change |
| 9. Both comments state current reasoning, contradict nothing | The two rewrites specified above | read-back in the report + the AC-9 grep |

## Non-Goals

- `clients.features` / feature flags, and the five code-side `Set<string>`
  toggles — CD-02.
- Any dashboard UI, wizard, or Active switch — CD-03.
- A second template. `TEMPLATE_REGISTRY` keeps exactly one entry; do not add a
  registry entry, a components directory or a `[data-template]` palette block.
- Populating `clients.custom_domain`, or changing how it is edited.
- Fixing `properties/loading.tsx`'s `headers()` call in a `(public)` route.
- Fixing `/cafirm/<realestate-slug>` if it returns 200.
- Adding a cache tag to `lookupClientBySlug`, or changing the 300s window.
- Adding an index, an enum, a `CHECK` constraint or a `templates` table.
- Touching `app/globals.css`, any component, or `scripts/dry-run.ts` (already
  stale for unrelated reasons).

## Open Decisions

1. **`getTenant()` deliberately does not gain an `isActive` check.** Task item 4
   names `getTenantBySlug()` only, and that is the enforcement point every public
   page and the whole dashboard tree resolves through. Adding a second check in
   the header path would change Server Action behaviour no AC covers. If the
   manager wants symmetry, say so and it is a one-line addition — otherwise it is
   deferred.
2. **Deactivating a tenant also 404s its dashboard.** Recommended and
   implemented as such (reactivation is an operator action, so it is not a
   lock-out), but CD-03 should confirm before shipping the Active switch, since
   an operator may want a holding page rather than a bare 404.
3. **No cache tag on `lookupClientBySlug`.** CD-03's Active/template switches
   will need one to make an edit take effect in under 300s. Not pre-wired here,
   per "do not scaffold future layers". CD-03 owns it.
4. **`profile.yaml` gains `template:` and the seed script writes it.** Judged
   in scope because without it `pnpm seed:client` — the only supported tenant
   creation path — would start producing 404ing tenants as a direct result of
   this increment. If the manager rules it out of scope, then `AGENTS.md`'s
   "Adding a tenant" must instead document a manual `UPDATE clients SET
   template_key = …` step, and that must be explicit rather than left implied.
5. **`/cafirm/<realestate-slug>` may return 200.** Evidence records
   before/after equality rather than an absolute 404. If it is 200, file it as a
   follow-up observation; do not fix it here.

## Architecture Conflicts

1. **The brief (§2 0A) says the gates "become `tenant.templateKey !== "premium-v2"`";
   this plan routes them through `templateKeyFor(tenant)` instead.** Deliberate,
   and the difference matters at exactly one place: `data-template`, which is a
   raw column value interpolated into a DOM attribute that selects the tenant's
   entire palette. A validating accessor means an unrecognised value can never
   reach it, keeps the return type identical to today's
   (`TemplateKey | undefined`, so all 37 substitutions are provably
   type-equivalent), and gives `getTenantBySlug` its fail-closed 404. The raw
   field comparison would work for the equality gates and quietly not for the two
   attribute sites. Recording the divergence because the brief is a governing
   document.
2. **`getTenantPath` changes signature from `(vertical, clientSlug)` to
   `(tenant)`.** All three callers already hold the row. The rejected alternative
   was a third positional argument `(vertical, clientSlug, templateKey)` — three
   strings whose order can be transposed with no type error. The object form
   cannot be got wrong. `lib/templates/index.ts` must declare the parameter as a
   **structural type**, not `import type { Tenant }` from `lib/db/schema` — the
   module is imported by `proxy.ts`, and even an erased type import makes AC 8's
   "read its imports" check less than obviously true.
3. **Task constraint "do not hand-write SQL" vs the required backfill.**
   drizzle-kit cannot generate a data statement. Resolved as: the DDL is
   generated by `pnpm db:generate` and not edited; the backfill `UPDATE` is
   appended after a `--> statement-breakpoint` in the generated file, which is
   the project's standard mechanism. Flagged so it is not read as a violation.
4. **The manager analysis's BLOCKER (CD-00, build-worker connection
   exhaustion).** This plan assumes it is resolved before implementation begins.
   If `pnpm build` still cannot complete, AC 4 and the primary regression signal
   do not exist — **stop and escalate rather than proceeding with weaker
   evidence**. The TypeScript phase passing is not a substitute: it proves the 37
   substitutions typecheck, not that the two `generateStaticParams` gates still
   produce pages.

## Manager Approval

APPROVED

Reviewed against the stage-3 bar: every AC maps to concrete implementation; no
query or action is added, so tenant scoping is unchanged and stated; the
migration is nullable + backfilled and safe against live rows; no cache key
changes and the reason is argued rather than asserted; rendering strategy is
stated per route; scope is bounded by an explicit Non-Goals list; blast radius is
named as global across all six tenants.

Three claims were verified independently against the code before approving,
because they change the work rather than merely describe it:

1. **The `generateStaticParams` projection trap is real.**
   `builders/[slug]/page.tsx:29` and `sectors/[sector]/page.tsx:30` do call the
   gate on the object `paramsForEachTenant` supplies, and `lib/static-params.ts`
   projects only `{ id, slug }`. A mechanical substitution would have returned
   `[]` and prerendered zero pages while the build reported success. Widening the
   projection **before** those two files are edited is mandatory, not advisory.
2. **The `custom_domain` NULL is not a live SEO defect.** `lib/sitemap.ts:101`
   `prefixFor()` returns `siteOrigin()` on `HOST_MODE` before reading the column,
   and `lib/og.ts originFor()` carries an explicit comment making the same
   decision deliberately. The comment in `lib/domains.ts` is wrong; the data is
   fine. Report-only is the correct call.
3. **`is_active = false` really does 404 the dashboard.**
   `app/site/[tenant]/dashboard/layout.tsx:21` resolves through
   `getTenantBySlug` and `notFound()`s on null.

### Rulings on Open Decisions

1. **`getTenant()` does not gain an `isActive` check — DEFERRED, as proposed.**
   Task item 4 names `getTenantBySlug()`, that is where every public page and the
   whole dashboard tree resolves, and this increment is already ~40 files. Record
   it in the implementation report as a **known limitation**: a deactivated
   tenant's staff holding a live `gz_session` cookie can still reach Server
   Actions, so writes are not stopped even though nothing renders. It is
   low-harm (the data changes, no page serves it) and CD-03 owns closing it
   alongside the Active switch.
2. **Deactivation 404ing the dashboard — ACCEPTED as designed.** Verified above.
   Reactivation is an operator action, so it is not a lock-out. CD-03 decides
   whether a holding page beats a bare 404.
3. **No cache tag on `lookupClientBySlug` — AGREED.** A tag nothing calls is
   scaffolding. CD-03 owns it.
4. **`profile.yaml` gains `template:`, the seed script writes it, and
   `AGENTS.md` + `README.md` are corrected — IN SCOPE, APPROVED.** Without it
   this increment would turn the only supported tenant-creation path into one
   that silently produces 404ing tenants. That is a regression *introduced by
   CD-01*, so repairing it is completing the change, not widening it. The two
   documentation fixes are the same defect class as task item 6 — instructions
   that contradict the code — and are equally required.
5. **`/cafirm/<realestate-slug>` — ACCEPTED.** Before/after equality is the right
   bar. The task file's evidence line asserting a 404 was **my error**; see the
   manager correction appended to `task.md`. Record the actual value, do not fix
   it here.

### Ruling on Architecture Conflict 1

**The divergence from the design brief is approved.** The brief (§2 0A) said the
gates become `tenant.templateKey !== "premium-v2"`; this plan routes them through
a validating `templateKeyFor()` instead. That is the better design for a reason
the brief did not anticipate: `data-template` interpolates the value into a DOM
attribute that selects the tenant's entire Tailwind palette, so an unvalidated
column value could silently restyle a whole tenant. Keeping the accessor's return
type identical to today's also makes all 37 substitutions provably
type-equivalent. The brief is a governing document and this overrides it on this
point; no further approval needed.

Conflicts 2 and 3 are accepted as argued. Conflict 4 stands: **if `pnpm build`
cannot complete at implementation time, stop and escalate.** Do not substitute
the TypeScript phase — it proves the substitutions typecheck, not that the two
`generateStaticParams` gates still produce pages.

### Amendment 1 — `isTemplateUrlSlug` hardening (added during defect cycle 2)

`## Expected Files / Modules` instructs that `isTemplateUrlSlug` and
`getTemplateKeyForUrlSlug` be kept "exactly as they are". **That instruction is
amended.** It meant "do not delete or restructure these exports"; it did not mean
"preserve a latent defect".

`/code-review high` found that `templateKeyFor`'s `key in TEMPLATE_REGISTRY`
walks the prototype chain, so `constructor` / `toString` / `valueOf` /
`__proto__` passed a check the function's own comment documents as fail-closed.
That was fixed in defect cycle 1 with `Object.hasOwn`. `isTemplateUrlSlug` reads
`urlSlug in URL_SLUG_TO_KEY` and has the identical weakness;
`getTemplateKeyForUrlSlug` does a bare index read and can return `Object`'s
constructor **function** from an accessor typed `TemplateKey | undefined`.

Ruled in scope because:

- Both live in `lib/templates/index.ts`, which this increment already rewrites.
  **`proxy.ts` is not touched**, so AC 8 — which protects that *file* — is
  unaffected.
- Leaving `Object.hasOwn(...)` and `... in ...` guarding the same failure mode a
  few lines apart in one small module invites a future reader to harmonise them
  in the wrong direction.
- For every legitimate template URL slug the two forms are identical.

**One intentional behaviour change**, the only one in this increment: a request
to `/realestate/<prototype-key>/<slug>` changes from rendering a real tenant at a
nonsense URL to redirecting to `/` — which is what the check already intends and
what every other unrecognised segment already does. It must be recorded as a
before/after *difference*, not folded in with the equality checks.

This exceeds the pipeline's one-rework-cycle rule. Deliberate: cycle 2 is not
rework of a failed fix but a two-word hardening of the same defect class in the
same file, surfaced by cycle 1 and cheaper to close now than to carry as a
standing finding into an increment that has no reason to open this file.

### Condition on starting

CD-00 must have passed independent verification before implementation begins.
Its fix is in place and the build completes (9,659/9,659, exit 0), which is what
makes the AC 4 baseline capturable.
