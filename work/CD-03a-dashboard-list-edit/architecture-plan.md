# ARCHITECTURE PLAN

CD-03a — Platform dashboard: client list and edit screens

## Work Item

Build the team-only client list at `/` and an edit screen for an existing client
at `/clients/[slug]`, covering business details, custom domain, active state, the
five `firm_settings` section toggles and the five `clients.features` flags. Add
the cache tag that makes an edit visible on the public site without waiting out
the ~10-minute window, and close the two standing findings that stop being
tolerable once an operator can flip a switch.

**This is the first increment in this programme that writes to an arbitrary
tenant's rows.** CD-01 and CD-02 were refactors whose acceptance bar was "nothing
observable changed". That bar does not apply here and copying their evidence
shape would under-verify this increment. The new bar has two halves: the six
tenants' *rendered output* is unchanged, **and** the new write surface changes the
right rows, refuses the wrong ones, and cannot be reached without a platform
session.

Creation is CD-03b. This increment owns read and update only.

## Expected Functional Outcome

A signed-in team member at `/`:

1. sees all six clients in one table — slug, display name, vertical, template,
   active, custom domain, last updated — with a link to the live site and to that
   client's own dashboard, a search box, and inactive rows visibly muted;
2. opens `/clients/<slug>` and edits, in three independently-saved panels:
   - **Identity & routing** — display name, custom domain, active;
   - **Business details** — firm name, tagline, overview, established year,
     registration number, business category, phone, WhatsApp, email, notification
     email, address, locality, region, postal code, country, latitude, longitude,
     Google Maps URL, opening hours (7 rows), social links (4 keys), and the five
     `firm_settings` section toggles;
   - **Features** — the five `clients.features` flags with the reasoning from
     their helper comments as on-screen text, and the guards enforced in the
     action;
3. sees the edit reflected on that client's public site within seconds, and sees
   on screen, per panel, when a change takes effect;
4. cannot change `slug` or `vertical`, cannot enable `reviewsEnabled` on a CA
   firm, cannot enable `homeLoan` without confirming the DSA relationship, and
   cannot enable `vastuSectors` beyond the cap or without an explicit
   acknowledgement.

Deactivating a client 404s its public pages **and** refuses its Server Actions;
reactivating restores both.

## Affected Tenants

**Rendered output: none of the six may change.** Baseline to preserve, CD-02's
verified per-tenant prerendered counts:

```
arora-k-associates      42
evergreen-real-estate  546
expert-realtors        547
high-properties       5005
nayra-realtors        1071
urban-flat-real-estate 1071
```

**Global or per-client gated: neither.** This is platform infrastructure at `/`
and `/clients/**`, outside the tenant route tree. No file under
`components/realestate/premium-v2/` or `app/site/[tenant]/` is touched.

**But six shared modules on the tenant read/write path do change** —
`lib/tenant.ts`, `lib/content.ts`, `lib/auth.ts`, `lib/actions/auth-actions.ts`,
`lib/actions/submit-query.ts`, `lib/domains.ts`, plus `proxy.ts`. Every one of
those is on every tenant's path, so the regression sweep is six-tenant and
non-negotiable even though no tenant is the subject of the work.

**Guinea pig: `urban-flat-real-estate`** for every mutation in the evidence.
**Never mutate `high-properties`** — live client on its own domain. **Never
enable `vastuSectors` on a second tenant**, including as a test fixture; the
cap's refusal path is proved by a pure function probe instead (see Evidence).

## Existing Implementation

### What already exists and is reused unchanged

| Thing | Where | Reused how |
|---|---|---|
| Platform auth (env, `gz_platform_session`, 1h, `jose` + bcrypt) | `lib/platform-auth.ts` | `requirePlatformAdmin(nextPath)` gates every new page and every new action |
| `/` gated, `force-dynamic`, `robots: noindex`, proxy pass-through | `app/page.tsx`, `proxy.ts:70` | Extended in place, not replaced |
| Slug fast path | `app/ClientLookupForm.tsx` + `app/lookup-actions.ts` | Kept verbatim as the fast path |
| `ActionResult` / `fail()` / `requireX()` write-action shape | `lib/actions/dashboard-actions.ts:25-45` | Copied as **style**, not imported — that file authenticates with `lib/auth.ts` and is scoped to one client |
| Form house style (Panel/Row/Input/TextArea, `useTransition`, feedback banner, `router.refresh()`, risk-labelled toggles) | `components/dashboard/SettingsForm.tsx` | Mirrored in new platform primitives; **not** imported (its primitives are file-local, not exported) |
| Validating accessors | `templateKeyFor()`, `featureEnabled()`, `getVerticalConfig()` | Read-side display and server-side guards both go through these |
| Feature reasoning text | `lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`, `lib/home-loan/enabled.ts` | CD-02 designated these the source for this increment's on-screen helper text |
| `clients.templateKey` (CD-01), `clients.features` jsonb (CD-02), the whole `firm_settings` NAP block | `lib/db/schema.ts` | Everything this increment writes already has a column |

### Finding 1 — resolved: `revalidatePath("/site")` is a **no-op**, and so is every other `revalidatePath` call in this repo

Determined against Next 16.3.3's own source, not from training data.

`revalidatePath(path, type?)` (`node_modules/next/dist/server/web/spec-extension/revalidate.js:85`) converts its argument into a single implicit tag `_N_T_<path>` and nothing else. The tags a rendered entry actually carries come from `getImplicitTags()`
(`node_modules/next/dist/server/lib/implicit-tags.js`), which produces, for a route:

- `_N_T_/layout`,
- one `…/layout` tag per **route-pattern** segment prefix of `workStore.page`,
  route groups included — e.g. `_N_T_/site/layout`,
  `_N_T_/site/[tenant]/layout`, `_N_T_/site/[tenant]/(public)/layout`,
  `_N_T_/site/[tenant]/(public)/properties/layout`,
- the page tag `_N_T_/site/[tenant]/(public)/properties/page`,
- and the **resolved pathname** tag, e.g.
  `_N_T_/site/urban-flat-real-estate/properties`.

`revalidatePath("/site")` produces exactly `_N_T_/site`. There is no `_N_T_/site`
in that set — the segment-prefix tags are all suffixed `/layout`, and the pathname
tag is the full resolved path. **It matches nothing.** Nor does it warn: the
missing-`type` warning fires only when `isDynamicRoute(path)` is true, and
`"/site"` contains no dynamic segment. It fails silently.

The same reasoning kills `revalidatePath("/site/dashboard/settings")`,
`"/site/properties"`, `"/site/updates"`, `"/site/localities"`,
`"/site/calculators"`, `"/site/services"`, `"/site/compliance-calendar"` and every
sibling in `lib/actions/dashboard-actions.ts` — every real route is
`/site/[tenant]/…`, so none of those literals is ever a rendered pathname or a
derived tag.

**Consequence, stated plainly: tenant-dashboard edits have never propagated to
the public site except by the 300s data-cache expiry compounding with the
layout's `revalidate = 300`.** "Settings saved." has been telling tenant admins
something that is true of the database and false of their website. This is
**pre-existing** and **not introduced here**.

What *does* work, and what CD-03a uses:

- a **literal** pathname — `revalidatePath("/sitemap.xml")`,
  `revalidatePath("/sitemaps/core.xml")` — matches the pathname tag exactly;
- a **route pattern plus type**, route group included —
  `revalidatePath("/site/[tenant]/(public)", "layout")` — matches the derived
  layout tag, but for **all six tenants at once**, because `[tenant]` is the
  literal pattern segment and not a resolved value. Too blunt for a per-tenant
  edit;
- a **cache tag**, which is per-tenant and precise. That is the mechanism this
  increment adds.

Whether to also repair the ~30 tenant-side `revalidatePath` calls is a scope
question — see **Open Decision 1**. It is not assumed either way here.

### Finding 2 — `revalidateTag(tag)` single-argument is deprecated in 16.3.3; `updateTag` is the correct call

`revalidateTag(tag)` with no second argument logs a deprecation warning and
behaves as `{ expire: 0 }`. `revalidateTag(tag, "max")` marks data stale but
serves the **stale** copy for up to a year while revalidating in the background —
which would make AC 2's evidence (an edit visible in seconds) fail intermittently
and look like a caching bug. `updateTag(tag)` expires immediately, is designed for
read-your-own-writes, and can only be called from a Server Action — which is
exactly where these run. **Use `updateTag`.** Do not write `revalidateTag`.

### Finding 3 — a tag on `unstable_cache` invalidates the rendered page too

`unstable_cache` pushes its `options.tags` onto the enclosing render's
`workUnitStore.tags`
(`node_modules/next/dist/server/web/spec-extension/unstable-cache.js:133-140`), so
the ISR entry for any route that read a tagged cached function inherits that tag.
The public layout calls both `getTenantBySlug` (→ `lookupClientBySlug`) and
`getFirmSettings(tenant.id)`, so **every** page under
`app/site/[tenant]/(public)/**` inherits both tags this increment introduces.
One `updateTag` per tag therefore invalidates the data cache **and** the
prerendered HTML for that tenant, and only that tenant. This is what makes AC 2
and AC 8 achievable without a deploy.

### Facts established by reading, that change the design

1. **`unstable_cache`'s `tags` are fixed at wrap time.** They cannot vary per
   argument. A per-tenant tag therefore requires creating the cached function
   *inside* a per-call wrapper, with the varying value in `keyParts`. See
   *Data Access* for the exact shape and the trap it creates.
2. **Only five `lib/content.ts` functions have a cross-request cache** —
   `getFirmSettings`, `getTeam`, `getCalculators`, `getLocalities`,
   `getPropertyImagesFor`. Everything else is React `cache()` only, i.e.
   per-request dedupe, and its staleness on the public site is the route's ISR
   entry, not a data entry.
3. **`getPropertyImagesFor(propertyIds)` takes no `clientId`** and therefore
   cannot carry a tenant tag. It keeps the existing `cached()` helper.
4. **`getTenant()` is called from exactly two places** outside `lib/tenant.ts` —
   `app/site/[tenant]/(public)/properties/loading.tsx:6` and
   `app/site/[tenant]/dashboard/login/page.tsx:15`. Both handle `null` safely
   (`templateKeyFor(null)` → `undefined` → generic skeleton; `notFound()`), so
   adding the `isActive` guard there has a two-file blast radius and no
   behaviour change for an active tenant.
5. **Closing the `isActive` gap needs four files, not one.** The mutating paths
   do **not** go through `getTenant()`; each runs its own `clients` query:
   `getSessionUser()` (`lib/auth.ts:84-89`), `login()`
   (`lib/actions/auth-actions.ts:30`), and `submitQuery()`
   (`lib/actions/submit-query.ts`, both the slug branch and the `customDomain`
   branch). The comment in `lib/tenant.ts:62-70` names all three; the comment is
   the specification, and rewriting it truthfully requires closing all of them.
6. **`proxy.ts` redirects any unknown first segment to `/`.** A new
   `/clients/<slug>` route would 307 to `/` with nothing explaining why. A
   path-mode-only segment exemption is required — pure URL parsing, no database.
7. **`clients.customDomain` has no unique constraint** (`lib/db/schema.ts:126`).
   `getTenant()`'s host branch and `submitQuery()`'s host branch both
   `.limit(1)`, so two rows sharing a domain resolve arbitrarily. This increment
   makes the column editable, so it owns an application-level uniqueness check.
8. **`clients` has no `updatedAt` column.** The list's "last updated" comes from
   `firm_settings.updated_at` via a LEFT JOIN.
9. **`sitemapClients()` has no `ORDER BY`** (`lib/sitemap.ts:70`), so sitemap
   output follows physical heap order. This increment **writes to `clients`**, so
   every save reshuffles it. Sitemap evidence must be compared as a **sorted
   set**, or the regression check produces spurious diffs. See Open Decision 4.
10. **`lib/verticals/index.ts` carries a fourth instance of the prototype-chain
    defect class** — `REGISTRY[vertical as VerticalId] ?? …` (bare index) and
    `value in REGISTRY` (`in` walks the prototype chain). Not assigned to this
    increment and `vertical` is never written here, so it is **recorded, not
    fixed**. See Architecture Conflicts.
11. **`SOCIAL_PLATFORMS` in `FooterV2` is `instagram, facebook, linkedin,
    youtube`** — four keys, not the five §9 lists. `x` has no icon in the
    premium-v2 footer but *would* land in `sameAs` via
    `lib/schema-org.ts:75`'s `Object.values`. The form exposes the four that
    render.
12. **`updateFirmSettings` never writes `openingHours`, `socialLinks`,
    `country` or `searchConsoleVerification`.** The platform form writes the
    first three, which means the jsonb columns need a **merge**, not a replace —
    see Database Changes.

## Owning Modules

| Module | Owns | This increment |
|---|---|---|
| `proxy.ts` | URL/hostname parsing. **No database, ever.** | +4 lines: a path-mode `clients` segment exemption beside the existing `login` one; rewrite the falsified `/` comment |
| `lib/tenant.ts` | Tenant resolution; re-verifies vertical + template against the row | Per-slug tagged `unstable_cache`; `isActive` on both `getTenant()` branches; rewrite the `isActive` comment |
| `lib/content.ts` | **Public** read side, `clientId`-scoped, two cache layers | Per-client tagged wrapper for the four `clientId` cached functions; rewrite the staleness comment |
| `lib/actions/` | Write side; re-checks auth and ownership per call | New `platform-actions.ts`; `isActive` predicates in `auth-actions.ts` and `submit-query.ts` |
| `lib/platform/` **(new)** | Platform-dashboard read side (deliberately cross-tenant) and its copy | `clients.ts` (server-only), `feature-copy.ts` (imports nothing) |
| `lib/cache-tags.ts` **(new)** | The two tag strings, one definition each | New |
| `components/platform/` **(new)** | Presentational platform forms | New |
| `components/` | Presentational only | Nothing under `components/realestate/**` or `components/dashboard/**` is touched |
| `lib/domains.ts` | Host → slug registry | `Object.hasOwn` fix |
| `lib/auth.ts` | Tenant session | `isActive` predicate |

**Why the platform read side is not in `lib/content.ts`.** `lib/content.ts`'s
contract is "every query is scoped by `clientId`". A client *listing* is
unscoped by definition. Putting it there would put an unscoped query behind a
module whose whole guarantee is that there are none, and the next reader would
reasonably copy it. `lib/platform/clients.ts` states in its header that it is
cross-tenant on purpose, that `requirePlatformAdmin()` is the only thing standing
in front of it, and that nothing under `app/site/[tenant]/` may import it.

## Dependencies

- CD-00 (build pool cap) — required for `pnpm build` to complete at all.
- CD-01 (`clients.template_key`, `templateKeyFor`, `getTenantBySlug` `isActive`
  guard) — the list's Template column and the Active switch's rendering half.
- CD-02 (`clients.features`, `lib/features.ts`, `featureEnabled`, the three gate
  modules and their reasoning comments) — the feature panel and its helper text.
- No new package. `jose`, `bcryptjs`, `lucide-react`, `drizzle-orm` are all
  already dependencies. **Do not add a validation library** — the repo validates
  with plain functions.
- Blocks CD-03b, which reuses `lib/platform/`, `components/platform/` and the
  cache tags.

## Domain Models

No new entity. Two existing entities are re-classified by becoming
operator-editable:

**`clients`** — *stable identity + mutable state, mixed.*
- Stable identity, **immutable after creation**: `id`, `slug`, `vertical`,
  `createdAt`.
- Mutable state, editable here: `displayName`, `customDomain`, `isActive`,
  `features`.
- Mutable state, **deliberately not exposed**: `templateKey`, `isDemo`.

**`firm_settings`** — *editorial content*, one row per client, wholly editable
here except the fields later increments own (`logoUrl` → CD-05; `seoTitle`,
`seoDescription`, `ga4MeasurementId`, `searchConsoleVerification` → CD-06).

**No observation-history entity.** There is no audit table and none is added —
that is a real limitation (Open Decision 5), not an oversight.

### `templateKey` — the ruling

**Not exposed in CD-03a.** Changing it on a live client changes `data-template`
(the entire palette in `app/globals.css`), changes `getTenantPath()`, and
therefore changes **every URL of that client's site**, invalidating its indexed
URLs and every inbound link. `TEMPLATE_REGISTRY` currently holds exactly one
template, so the only reachable edits are "the value it already has" and "a value
that 404s the whole site" (`getTenantBySlug` returns null for a `realestate` row
whose key is not in the registry). A control whose only non-identity outcome is
total site failure should not be rendered.

The edit screen **displays** the template read-only, with the resolved label from
`getTemplateConfig(templateKeyFor(row))` and, when `templateKeyFor(row)` is
`undefined` on a `realestate` row, a prominent error state saying the site does
not resolve. CD-03b owns setting it at creation.

## Database Changes

**None. No migration. No new column, no new index, no new constraint.**

Everything written here already has a column: `clients.template_key` (CD-01),
`clients.features` (CD-02), and the whole `firm_settings` NAP/section-toggle
block. **If the implementation finds itself needing a migration, that is the
signal that the increment has drifted into CD-03b — stop and raise an
ARCHITECTURE_BLOCKER rather than writing one.**

### Existing tables reused

`clients` (read + update), `firm_settings` (read + update). Read-only for the
list: none other. No other table is read or written.

### Tables changed/added

None.

### Columns

Written by `updateClientIdentity` → `clients`:

| Column | Type | Null? | Validation in the action |
|---|---|---|---|
| `display_name` | `text NOT NULL` | no | trimmed; empty → refuse, `"A display name is required."` |
| `custom_domain` | `varchar(255)` | yes | normalised (lowercase, strip scheme, strip `www.`? **no** — `HOST_TENANT_MAP` distinguishes `www.` explicitly, so keep the host exactly as typed apart from lowercasing, stripping a scheme, a port and a trailing slash), hostname-shaped, unique across `clients` excluding this row; empty → `null` |
| `is_active` | `boolean NOT NULL` | no | checkbox presence |

Written by `updateClientBusinessDetails` → `firm_settings`:

`firm_name` (NOT NULL, refuse if empty), `tagline`, `overview`,
`established_year`, `firm_registration_number`, `business_category`, `phone`,
`whatsapp`, `email`, `notification_email`, `address_line`, `locality`, `region`,
`postal_code`, `country`, `latitude`, `longitude`, `google_maps_url`,
`opening_hours`, `social_links`, `reviews_enabled`, `pricing_enabled`,
`awards_enabled`, `client_logos_enabled`, `team_enabled`, `updated_at`.

Every text field follows the house idiom `String(fd.get(x) ?? "").trim() || null`.

Written by `updateClientFeatures` → `clients.features` (whole jsonb object,
rebuilt from the five known keys — see Constraints).

**Numeric precision.** `latitude` / `longitude` are `varchar(32)`, not `real`.
That is pre-existing and is **not changed here** — a type migration is a
migration, and this increment must not carry one. Because the column is a
`varchar`, the action carries the application validation that the type would
otherwise give: reject a value that is not a finite decimal number, reject
latitude outside `[-90, 90]` and longitude outside `[-180, 180]`, and require
both-or-neither. A bad pair reaches `geo` in the organisation JSON-LD and the
map. Refusal message: `"Latitude and longitude must both be decimal numbers, or
both be empty."` Recorded as Open Decision 6.

### Constraints

- **Per-client uniqueness that exists:** `clients.slug` is `UNIQUE`;
  `firm_settings.client_id` is `UNIQUE` (one settings row per client). Both
  already correct.
- **Per-client uniqueness that does not exist and is enforced in application
  code here:** `clients.custom_domain`. The action runs
  `SELECT id, slug FROM clients WHERE lower(custom_domain) = $1 AND id <> $2`
  and refuses with `"That domain is already assigned to <other-slug>."` A partial
  unique index (`WHERE custom_domain IS NOT NULL`) is the durable fix and is
  deferred as Open Decision 2, because it is a migration and no schema change is
  expected in this increment.
- **`features` is a closed set of five booleans.** The action rebuilds the object
  from the five known keys rather than spreading the posted form, so an
  attacker-supplied `features` key cannot be persisted:

  ```ts
  const next: ClientFeatures = {
    propertyMap:               fd.get("propertyMap") === "on",
    propertyManagementSection: fd.get("propertyManagementSection") === "on",
    propertyManagementPage:    fd.get("propertyManagementPage") === "on",
    vastuSectors:              fd.get("vastuSectors") === "on",
    homeLoan:                  fd.get("homeLoan") === "on",
  };
  ```

  All five keys are written explicitly, so the persisted object no longer relies
  on `FEATURE_DEFAULTS` for this row. That is intentional and safe: the form is
  seeded from `featureEnabled(row, key)`, so the resolved value is preserved
  exactly. **`featureEnabled` remains the only read path** — do not read
  `row.features.x` anywhere.
- **`opening_hours` and `social_links` are jsonb and must not be clobbered.**
  `opening_hours` is fully represented by the 7-row grid, so a full replace in
  fixed `Monday…Sunday` order is correct. `social_links` is **merged**: start
  from `row.socialLinks ?? {}`, set or delete each of the four managed keys from
  the form, and leave any other key untouched. A blind replace would silently
  delete a key seeded from YAML that the form does not render.

### Indexes

None added. Every query the platform surface runs is either a full six-row scan
of `clients` (the listing, the vastu count, the domain-uniqueness check) or a
lookup on an already-indexed unique column (`clients.slug`, `clients.id`,
`firm_settings.client_id`). Six rows do not justify an index, and adding one is a
migration.

### Relationships

`firm_settings.client_id → clients.id ON DELETE CASCADE`, unchanged. **Nothing
here deletes.** `onDelete: cascade` is on every content table, so a delete is
unrecoverable; the Active switch is the designed alternative and there is no
delete control anywhere in this increment.

### Migration strategy

Not applicable — there is no migration. `drizzle/` and `lib/db/schema.ts` are
**untouched**, and `drizzle/meta/_journal.json` must be byte-identical after this
increment. That is an evidence item.

## Data Access (lib/content.ts)

### `lib/cache-tags.ts` — new, imports nothing

```ts
/**
 * The two cache tags that make a platform edit visible without waiting out the
 * cache window, defined once each because a tag is matched by string equality
 * and a typo fails silently — Next never warns that a tag matched nothing.
 *
 * Two tags rather than one, because the two producers know the tenant by
 * different keys and neither can cheaply learn the other's: `lookupClientBySlug`
 * in lib/tenant.ts is given a slug and has not yet read the row, while every
 * cached read in lib/content.ts is given a clientId and never sees the slug. A
 * writer holds the whole row, so invalidating both costs one extra line at the
 * one place that can afford it.
 *
 * This module imports nothing on purpose, so it can be reached from a Client
 * Component's module graph without dragging the database driver in.
 */
export function tenantSlugTag(slug: string): string { return `tenant-slug:${slug}`; }
export function tenantDataTag(clientId: string): string { return `tenant:${clientId}`; }
```

Both stay far under the 256-character tag limit; a tag over it is never assigned
to cached data and revalidating it does nothing.

### `lib/tenant.ts` — `lookupClientBySlug` gains a per-slug key part and a tag

Replace the module-level `unstable_cache` with a per-call wrapper. The call site
(`await lookupClientBySlug(slug)`, twice) does not change.

```ts
/**
 * Slug -> client row, cached across requests. This lookup runs on every single
 * request (layout, page, metadata) and is a cross-region query, so leaving it
 * uncached cost a round trip on every navigation.
 *
 * The cache is created per call rather than once at module load because
 * `unstable_cache`'s `tags` are fixed at wrap time and cannot vary by argument,
 * and this tag has to name the tenant — otherwise one client's edit would expire
 * all six. The rejected alternative was a single shared tag: it works, and it
 * makes every platform save re-query the database for every tenant on the next
 * request to each of their sites.
 *
 * `slug` MUST stay in the key parts. `unstable_cache` derives its key from the
 * key parts, the stringified callback and the callback's arguments — and this
 * inner closure takes no arguments and stringifies identically for every slug.
 * Drop it and all six tenants share one entry, which is not a slow site, it is
 * the wrong client's site.
 */
function lookupClientBySlug(slug: string) {
  return unstable_cache(
    async () => {
      const [row] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
      return row ?? null;
    },
    ["client-by-slug", slug],
    { revalidate: 300, tags: [tenantSlugTag(slug)] },
  )();
}
```

`revalidate: 300` is **unchanged**. Changing the window is on §11's list of
decisions no agent may make alone, and the tag makes it unnecessary: 300s is now
the ceiling on staleness from an *unobserved* change, not the latency of an
operator edit.

### `lib/content.ts` — a per-client tagged wrapper

Add beside the existing `cached()` (which stays, for `getPropertyImagesFor`):

```ts
/**
 * Cross-request cache for a read scoped to one client, tagged so a platform edit
 * can expire exactly that client's entries.
 *
 * Same shape and same reason as `lookupClientBySlug` in lib/tenant.ts: the cache
 * is built per call because `unstable_cache`'s tags are fixed at wrap time, and
 * `clientId` is in the key parts because the inner closure takes no arguments and
 * stringifies identically for every tenant.
 */
function cachedForClient<T>(keyPart: string, clientId: string, fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, [keyPart, clientId], {
    revalidate: REVALIDATE_SECONDS,
    tags: [tenantDataTag(clientId)],
  })();
}
```

Applied to the four `clientId`-scoped cached functions, React `cache()` kept
outside so per-request dedupe is unchanged:

| Function | Key part | Tag |
|---|---|---|
| `getFirmSettings` | `"firm-settings"` | `tenantDataTag(clientId)` |
| `getTeam` | `"team"` | `tenantDataTag(clientId)` |
| `getCalculators` | `"calculators"` | `tenantDataTag(clientId)` |
| `getLocalities` | `"localities"` | `tenantDataTag(clientId)` |
| `getPropertyImagesFor` | `"property-images-batch"` | **none** — keeps `cached()` |

Shape, for each of the four:

```ts
export const getFirmSettings = cache(async (clientId: string) =>
  cachedForClient("firm-settings", clientId, async () => {
    const [row] = await db.select().from(firmSettings)
      .where(eq(firmSettings.clientId, clientId)).limit(1);
    return row ?? null;
  }),
);
```

`getPropertyImagesFor` keeps `cached()` and gains one comment saying why: it is
keyed by property ids and never receives a `clientId`, so it cannot carry a
tenant tag; nothing in this increment writes property images, and inventing a
`clientId` parameter for it would change 12 call sites for no behaviour this
increment needs.

`getTeam`, `getCalculators` and `getLocalities` are tagged even though nothing
here writes them. That is not scaffolding — the tag is called, by the platform
actions, on every save. It is deliberate over-invalidation: one extra
cross-region query per tenant on the first request after a rare operator edit,
in exchange for a tag that means "this tenant's cached read-side data" rather
than "two particular functions". State that in the comment.

**One-off effect to expect and not misdiagnose:** the cache key strings change
shape, so the first request per tenant after deployment is a miss for all four
functions plus `lookupClientBySlug`. Harmless, and it does not affect a build.

### Platform read side — `lib/platform/clients.ts` (new, server-only)

```ts
/**
 * Read side for the platform dashboard at `/`. Deliberately NOT in
 * lib/content.ts: that module's whole contract is that every query is scoped by
 * clientId, and a client listing is unscoped by definition. Putting it there
 * would hide the one unscoped query in the module that promises there are none,
 * and the next reader would copy it.
 *
 * What stands in front of these queries is `requirePlatformAdmin()` in the page
 * or action that calls them, and nothing else. Nothing under app/site/[tenant]/
 * may import this file.
 *
 * Uncached on purpose. The operator must see the row as it actually is, not as
 * a 300-second-old cache remembers it — and both callers are `force-dynamic`
 * pages that no cache would serve anyway.
 */
export async function listClientsForPlatform(): Promise<PlatformClientRow[]>
export async function getClientForPlatform(slug: string): Promise<{ client: Tenant; settings: FirmSettingsRow | null } | null>
export async function vastuSectorTenants(): Promise<{ id: string; slug: string }[]>
```

- `listClientsForPlatform()` —
  `db.select({ id, slug, vertical, templateKey, displayName, customDomain, isActive, isDemo, features, createdAt, settingsUpdatedAt: firmSettings.updatedAt, firmName: firmSettings.firmName }).from(clients).leftJoin(firmSettings, eq(firmSettings.clientId, clients.id)).orderBy(asc(clients.slug))`.
  `leftJoin`, not `innerJoin` — a client with no `firm_settings` row must still
  appear, and after CD-03b's wizard a half-created one is exactly what an
  operator needs to see. **No try/catch.** `activeTenants()` swallows database
  errors to keep the build alive; copying that here would render an empty client
  list that reads as "you have no clients" when it means "the database is
  unreachable". Failing loudly is correct on a gated operator page — put that
  reasoning in a comment, because the swallow next door will otherwise look like
  the house pattern.
- `getClientForPlatform(slug)` — the row plus its settings row, by exact slug.
- `vastuSectorTenants()` — selects `id, slug, features` for **all** clients and
  filters in JS with `vastuSectorsEnabled(row)`. **Not** a SQL predicate on
  `features->>'vastuSectors'`: jsonb is untyped, `featureEnabled` treats anything
  that is not literally a boolean as absent and applies `FEATURE_DEFAULTS`, and a
  SQL predicate would diverge from that on `"true"`, `1` and `null` — which is
  precisely the divergence CD-02's `Object.hasOwn` guard exists to prevent. Six
  rows; the query is free. Reusing the validated accessor is the point.

## Server Actions (lib/actions/)

New file `lib/actions/platform-actions.ts`, `"use server"`. Three actions, one
per panel, so a refusal in one does not discard the operator's edits in another.

```ts
export async function updateClientIdentity(formData: FormData): Promise<ActionResult>
export async function updateClientBusinessDetails(formData: FormData): Promise<ActionResult>
export async function updateClientFeatures(formData: FormData): Promise<ActionResult>
```

`ActionResult` is re-declared in this file (`{ ok: boolean; message?: string }`)
rather than imported from `dashboard-actions.ts`: importing it would pull that
module's `lib/auth.ts` and filesystem imports into the platform graph for a
two-field interface. Say so in a comment.

### The mandatory preamble, identical in all three

```ts
export async function updateClientIdentity(formData: FormData): Promise<ActionResult> {
  try {
    // A Server Action is a directly reachable POST endpoint. The gated page
    // having rendered proves nothing about the caller, and unlike the tenant
    // dashboard's actions a hole here is not one client's bug — it is an
    // unauthenticated write path into every client's live content.
    await requirePlatformAdmin("/");

    const clientId = String(formData.get("clientId") ?? "");
    const row = await loadClientRow(clientId);     // re-read from the database
    if (!row) return { ok: false, message: "Client not found." };
    ...
  } catch (error) {
    // requirePlatformAdmin() redirects when the 1h session has expired, and a
    // redirect is thrown. Without this the catch below swallows it and returns
    // "NEXT_REDIRECT" as if it were a validation message.
    unstable_rethrow(error);
    return fail(error);
  }
}
```

Three points the coder must not vary:

1. **`unstable_rethrow(error)` is the first statement in every catch**, imported
   from `next/navigation`. `requirePlatformAdmin` calls `redirect()`, which
   throws a `NEXT_REDIRECT` control-flow error; `dashboard-actions.ts`'s
   `catch → fail(error)` pattern would turn a session expiry into the on-screen
   message `"NEXT_REDIRECT"`. Redirecting on expiry is the *wanted* behaviour
   (the operator lands on `/login` mid-edit rather than seeing a cryptic error),
   so the fix is the rethrow, not removing the redirect.
2. **The `clientId` from `FormData` is used only to re-read the row.** Nothing
   else in the payload is trusted to describe the client. Every guard reads
   `row.vertical`, `row.slug`, `row.features` from the freshly-read row. This is
   the platform analogue of `assertOwnership` — there is no owning tenant to
   compare against, because a platform admin may legitimately edit any client, so
   the check that matters is *"the caller is the platform admin"* plus *"the
   target row is what the database says it is"*.
3. **`slug` and `vertical` never appear in any `.set({...})`.** Structurally
   unwritable, not merely absent from the form.

### `updateClientIdentity` — immutability, domain, active

Guards, in order, each returning `{ ok: false, message }`:

| # | Condition | Message |
|---|---|---|
| I1 | posted `slug` present and `!== row.slug` | `"The client ID cannot be changed after creation — it is in every URL of this client's site. Create a new client instead."` |
| I2 | posted `vertical` present and `!== row.vertical` | `"A client's vertical cannot be changed after creation."` |
| I3 | `displayName` empty after trim | `"A display name is required."` |
| I4 | `customDomain` non-empty and not hostname-shaped | `"Enter a bare hostname, for example highproperties.in."` |
| I5 | `customDomain` already on another row | `"That domain is already assigned to <other-slug>."` |

I1/I2 are belt **and** braces: the fields are never written, so a direct POST
carrying them changes nothing (provable by SQL), *and* the mismatch produces a
visible refusal (provable by the response). AC 3 asks for the POST proof; the
message is what stops a future reader from "helpfully" wiring the field up.

Then `db.update(clients).set({ displayName, customDomain, isActive })
.where(eq(clients.id, row.id))`, then invalidation.

### `updateClientBusinessDetails` — firm_settings + section toggles

| # | Condition | Message |
|---|---|---|
| B1 | `firmName` empty after trim | `"The firm name is required."` |
| B2 | `row.vertical === "cafirm"` and `reviewsEnabled` posted as on | `"Reviews and ratings cannot be enabled for a chartered-accountancy firm. ICAI's Code of Ethics prohibits testimonials, star ratings and endorsements on a firm's own website."` |
| B3 | lat/long not both-empty or both-valid-decimal-in-range | `"Latitude and longitude must both be decimal numbers, or both be empty."` |

B2 refuses the **whole save** rather than silently coercing the flag to false.
Silent coercion would show "Saved." next to a checkbox the operator had ticked —
the same class of lie as `revalidatePath("/site")`. The vertical comes from
`row.vertical`, never from the payload.

If the settings row is missing (`UPDATE` affects zero rows), return
`{ ok: false, message: "This client has no settings row yet." }` rather than
reporting success. **Do not insert one** — creating the settings row is CD-03b's
transaction, and inserting a partial one here would produce exactly the
half-configured client CD-03b is designed to prevent.

### `updateClientFeatures` — the three guards that are the substance

Constants and messages live in `lib/platform/feature-copy.ts` so the on-screen
text and the refusal text cannot drift apart:

```ts
export const VASTU_TENANT_CAP = 3;
export const VASTU_ROUTES_PER_TENANT = 3700;
```

The vastu decision is a **pure function** in that same module — no database, no
imports — so the cap's refusal branch is provable without ever putting a second
tenant into the state that has already failed a deploy:

```ts
export type VastuDecision = { ok: true } | { ok: false; message: string };

/**
 * Whether this tenant may switch vastu sector pages on.
 *
 * Pure, and in this file rather than inline in the action, for two reasons. It
 * is the single source for both the refusal message and the warning the form
 * renders, so the two cannot disagree about the count or the route cost. And the
 * cap branch is otherwise unreachable in a state anyone is willing to create —
 * three enabled tenants is a 32-minute build, and the fourth is the deploy that
 * failed after 41 minutes — so making it a function is what makes it testable at
 * all.
 *
 * `enabledSlugs` excludes the target. `acked` is the operator's explicit
 * acknowledgement, required for ANY new tenant, because
 * docs/client-dashboard-brief.md §11 reads as "one more than now", not as an
 * ordinal: exactly one tenant carries the matrix today.
 */
export function vastuDecision(enabledSlugs: string[], acked: boolean): VastuDecision
```

Behaviour:

- `enabledSlugs.length >= VASTU_TENANT_CAP` → refuse, regardless of `acked`:
  `"Vastu sector pages are capped at 3 tenants and 3 already have them (<slugs>). Each tenant adds about 3,700 prerendered routes; three is the most that has ever shipped, at a 32-minute production build, and a fourth pushed the deployment past its output limit and failed after 41 minutes. Turn it off for another tenant first."`
- `enabledSlugs.length >= 1` and `!acked` → refuse:
  `"Enabling vastu sector pages here would make this the <N+1>th tenant with them, adding about 3,700 prerendered routes to every build (currently <N> tenant: <slugs>). docs/client-dashboard-brief.md §11 lists this as a decision that needs a person. Tick the confirmation to proceed."`
- otherwise `{ ok: true }`.

Guards in the action:

| # | Condition | Behaviour |
|---|---|---|
| F1 | `vastuSectors` turning **on** (was off, now on) | call `vastuDecision(await vastuSectorTenants() minus this row, fd.get("vastuSectorsAck") === "on")`; refuse with its message |
| F2 | `homeLoan` turning **on** and `fd.get("homeLoanDsaConfirmed") !== "on"` | `"Home-loan pages state that the firm is an authorised channel partner. Confirm that this client holds a DSA relationship before enabling them."` |
| F3 | any posted key outside the five | ignored — the object is rebuilt from the five known keys, never spread from the form |

F1 and F2 fire on the **transition** only, computed as
`!featureEnabled(row, key) && posted`. Re-saving the panel with a flag already on
must not demand the acknowledgement again — otherwise the operator cannot change
`propertyMap` on `high-properties` without re-confirming a DSA relationship, and
a confirmation that is demanded routinely stops being read.

Then `db.update(clients).set({ features: next }).where(eq(clients.id, row.id))`.

### Invalidation — one helper, called by all three

```ts
/**
 * Expire everything the public site caches for this tenant.
 *
 * `updateTag`, not `revalidateTag`. In Next 16.3.3 the single-argument
 * `revalidateTag(tag)` is deprecated and warns, and `revalidateTag(tag, "max")`
 * keeps serving the stale copy for up to a year while it revalidates behind the
 * request — which is exactly wrong for an operator who has just pressed Save and
 * is about to open the site to check. `updateTag` expires immediately and is
 * only callable from a Server Action, which is what these are.
 *
 * Both tags, because the two producers key on different things: the slug tag
 * covers `lookupClientBySlug` in lib/tenant.ts, the client tag covers the cached
 * reads in lib/content.ts. Each is inherited by the ISR entry of every public
 * page that read it, so these two lines expire this tenant's rendered HTML as
 * well as its cached rows — and no other tenant's.
 */
function invalidateTenant(row: { id: string; slug: string }) {
  updateTag(tenantSlugTag(row.slug));
  updateTag(tenantDataTag(row.id));
}

/**
 * The sitemaps are plain route handlers with `revalidate = 3600` that read
 * `clients` directly, so they carry none of the tags above. They are addressed
 * by literal pathname, which is the one `revalidatePath` form that actually
 * matches: Next turns the argument into the implicit tag `_N_T_<path>`, and a
 * rendered entry carries its resolved pathname as exactly that tag. The
 * `"/site"`-style calls in lib/actions/dashboard-actions.ts do not match
 * anything and never have.
 */
function invalidateSitemaps() {
  revalidatePath("/sitemap.xml");
  for (const family of SITEMAP_FAMILIES) revalidatePath(`/sitemaps/${family.id}.xml`);
}
```

- `updateClientIdentity` → `invalidateTenant` **and** `invalidateSitemaps`
  (`isActive` changes membership; `customDomain` changes `prefixFor()` in path
  mode).
- `updateClientBusinessDetails` → `invalidateTenant` only. No `firm_settings`
  field appears in a sitemap URL.
- `updateClientFeatures` → `invalidateTenant` **and** `invalidateSitemaps` (the
  `home-loan` and `vastu-sectors` families are feature-gated in
  `entriesForFamily`).

**No `revalidatePath` for `/` or `/clients/[slug]`.** Both are `force-dynamic`;
there is nothing cached to invalidate. The forms call `router.refresh()` exactly
as `SettingsForm` does. Do not copy the tenant actions' habit of revalidating the
dashboard path — it is a no-op there too.

### `isActive` enforcement — four files, closing the standing finding

The rendered surfaces are already covered by `getTenantBySlug` (CD-01). The
**write** surfaces are not, and each runs its own `clients` query, so each gets
the predicate at its own query rather than through a new shared helper (a shared
helper would have to read `headers()` and would drag `lib/tenant.ts` into
`lib/auth.ts`):

| File | Change |
|---|---|
| `lib/tenant.ts` `getTenant()` | slug branch: `if (!row.isActive) return null;` after the lookup, before the vertical check. Host branch: add `eq(clients.isActive, true)` to the `customDomain` query |
| `lib/auth.ts` `getSessionUser()` | `.where(and(eq(clients.slug, tenantSlug), eq(clients.isActive, true)))` — a live `gz_session` for a deactivated tenant now resolves to no user, so `requireUser`/`requireAdmin` throw and every dashboard action refuses |
| `lib/actions/auth-actions.ts` `login()` | same predicate on the tenant lookup — a deactivated tenant's staff cannot obtain a new session either |
| `lib/actions/submit-query.ts` | `eq(clients.isActive, true)` on **both** branches (slug and `customDomain`) — lead submission stops writing rows |

None of these four reads is cached, so deactivation takes effect on the very next
request with no cache lag. The rendered side lags only as long as `updateTag`
takes to be honoured, i.e. the next request.

### `lib/domains.ts` — the prototype-chain fix

```ts
export function tenantSlugForHost(host: string): string | null {
  const clean = host.split(":")[0].toLowerCase();
  // `Object.hasOwn`, not a bare index: `HOST_TENANT_MAP` is a plain object, so
  // `Host: constructor` returned Object's constructor *function* from a
  // signature that promises `string | null` — and, because `??` catches only
  // null and undefined, that request also skipped the PRIMARY_HOST_TENANT
  // fallback every other unmapped host receives. Third instance of the defect
  // CD-01's Amendment 1 closed in lib/templates/index.ts; same fix.
  if (Object.hasOwn(HOST_TENANT_MAP, clean)) return HOST_TENANT_MAP[clean];
  return PRIMARY_HOST_TENANT || null;
}
```

Behaviour change: `constructor`, `toString`, `valueOf`, `__proto__` and
`hasOwnProperty` now take the fallback path like any other unmapped host. No
legitimate hostname changes.

## Routes

| Route | File | Status |
|---|---|---|
| `/` | `app/page.tsx` | **modified** — client list + retained `ClientLookupForm` |
| `/clients/[slug]` | `app/clients/[slug]/page.tsx` | **new** — edit screen |
| `/login` | `app/login/**` | unchanged |
| `app/site/[tenant]/**` | — | **not touched** |

### `proxy.ts` — the segment exemption

Without it, `/clients/urban-flat-real-estate` hits the path-mode branch with
`vertical = "clients"`, fails `isVerticalId`, and 307s to `/` — a silent
misroute. Add beside the existing `login` exemption, in the **path-mode branch
only**:

```ts
  // The platform dashboard's client screens (app/clients/**) — team-only, same
  // gate as `/`. Exempted here for the same reason as `login` above: "clients"
  // is not a registered vertical id, so without this the generic unknown-vertical
  // redirect below would bounce every one of these URLs to `/` with nothing
  // saying why. No conflict with a tenant URL: segment 0 is always the vertical,
  // never a client slug. Path mode only — in host mode every path belongs to the
  // one client that domain serves, and there is no platform dashboard there.
  if (vertical === "clients") return NextResponse.next();
```

This is URL parsing only. **No database access is added to `proxy.ts` and none
may be** — §11 lists that as a decision no agent may make alone, and the
cross-region cost is on every request.

`proxy.ts` will therefore no longer hash-match CD-01's recorded
`fdfccc96085a1509…`. That is expected; the evidence records the new hash and the
diff, and the six-tenant status sweep is what proves no tenant URL regressed.

## Rendering Strategy

| Route | Mode | Why |
|---|---|---|
| `/` | `export const dynamic = "force-dynamic"` (already set) | Reads the platform session cookie and must show live rows. Already dynamic; the listing does not change that |
| `/clients/[slug]` | `export const dynamic = "force-dynamic"` | Same. Declared explicitly to match `app/page.tsx` rather than relying on `cookies()` implying it |
| `app/site/[tenant]/(public)/**` | unchanged — prerendered, `revalidate = 300` | **Nothing in this increment may push a public route dynamic.** No public page gains a `headers()` call, and the only public-path changes are inside already-server-only cached functions |

`generateStaticParams`: **unchanged everywhere.** No route's param set changes,
no `lib/static-params.ts` projection widens, `StaticParamTenant` is untouched.
Neither new route is under `[tenant]`, so neither has or needs a
`generateStaticParams`, and the ancestor-`tenant` rule does not apply.

**What remains deploy-bound, and must say so on screen:**

- Turning `vastuSectors` or `homeLoan` **on** — the pages become reachable
  immediately (`dynamicParams` is true everywhere; no route sets it false) and
  are served on demand, then cached. They are **prerendered** only at the next
  deploy. On-screen wording: *"Live within seconds. The new pages render on first
  visit and are prerendered at the next deploy."*
- A newly activated client — same: reachable immediately, prerendered next
  deploy. On-screen: *"Live within seconds. Prerendered at the next deploy."*
- Brand icons and OG images (`lib/brand-icons.ts` `ICON_SETS`,
  `public/verticals/…/brand/<slug>-logo.png`) are code and files, not rows.
  Nothing here edits them; the screen says so and names CD-05.
- `templateKey` — not exposed at all.

Everything else in the three panels is live-on-save. The panel notes must say
which of the two a field is, and must never say "live" about something that is
not. A "Settings saved" message that is technically true and practically false is
the exact defect this increment was scoped around.

### Server / Client boundary

| Component | Kind | Notes |
|---|---|---|
| `app/page.tsx` | **Server** | `requirePlatformAdmin`, `listClientsForPlatform()`, renders the table. The search box is a plain `<form method="get">` posting `?q=` back to the same page and filtered on the server — no client JS, no state |
| `app/ClientLookupForm.tsx` | Client (existing) | unchanged |
| `app/clients/[slug]/page.tsx` | **Server** | `requirePlatformAdmin("/clients/<slug>")`, `getClientForPlatform(slug)`, `notFound()` when absent, `vastuSectorTenants()` for the live count, `getVerticalConfig(row.vertical)` for the labels; resolves all five flags with `featureEnabled(row, key)`; passes plain props down |
| `components/platform/ClientIdentityForm.tsx` | **Client** | `useTransition`, feedback banner, `router.refresh()` |
| `components/platform/BusinessDetailsForm.tsx` | **Client** | same; `reviewsEnabled` rendered disabled with the ICAI note when `vertical === "cafirm"` |
| `components/platform/FeatureToggles.tsx` | **Client** | the two confirmation checkboxes; renders the live vastu count from a **prop** |
| `components/platform/form-primitives.tsx` | **Client** | `Panel`, `Row`, `Input`, `TextArea`, `Toggle`, `Feedback`, `EffectNote` |
| `lib/platform/feature-copy.ts` | **shared, imports nothing** | strings, the two constants, `vastuDecision`; type-only import of `FeatureKey` from `lib/features.ts`, which itself imports nothing |

**The hard constraint, and it is CD-02's lesson repeated:** no `"use client"`
file may import `lib/db`, `lib/tenant`, `lib/content`, `lib/platform/clients`,
`lib/features` (value import), or any of the three gate modules. A Client
Component cannot do a lookup. Everything it needs — the resolved feature
booleans, the live vastu count and the slugs holding it, the vertical's
registration label, the resolved template label — is computed in the Server
Component and passed as a serialisable prop. Server Actions may be imported into
a Client Component; that is the one legal crossing, and it is how
`SettingsForm.tsx` already works.

## Caching and Revalidation

Summarised; mechanics are in *Data Access* and *Server Actions*.

| Cache | Key parts | Tag | Invalidated by |
|---|---|---|---|
| `lookupClientBySlug` (`lib/tenant.ts`) | `["client-by-slug", slug]` | `tenant-slug:<slug>` | all three platform actions |
| `getFirmSettings` | `["firm-settings", clientId]` | `tenant:<clientId>` | all three |
| `getTeam` | `["team", clientId]` | `tenant:<clientId>` | all three |
| `getCalculators` | `["calculators", clientId]` | `tenant:<clientId>` | all three |
| `getLocalities` | `["localities", clientId]` | `tenant:<clientId>` | all three |
| `getPropertyImagesFor` | `["property-images-batch"]` + args | none | nothing (unchanged) |
| ISR entries for `app/site/[tenant]/(public)/**` | route | inherits **both** tags via the layout | all three, transitively |
| `/sitemap.xml`, `/sitemaps/<family>.xml` | route, `revalidate = 3600` | pathname tag | `revalidatePath` literals, from identity + features |
| `/`, `/clients/[slug]` | `force-dynamic` | — | nothing needed |

Every key part includes every argument that changes the result: `slug` for the
tenant lookup, `clientId` for the four content reads, and the default
argument-derived key for `getPropertyImagesFor`. The `revalidate: 300` windows
are unchanged — §11 forbids changing them unilaterally, and the tag makes it
unnecessary.

## Per-Client Gating

Nothing in this increment is gated per client; it is platform infrastructure
outside the tenant tree. The five per-client gates it **edits** stay exactly
where CD-02 put them — `clients.features`, read only through `featureEnabled()`,
with the reasoning in the three gate modules. No gate moves, no accessor changes
signature, no gate becomes async.

The five `firm_settings` section toggles remain per-client row data and keep
their existing defaults.

**Placement ruling, restated because it is load-bearing:** the five feature flags
are edited on the **platform** dashboard and are **not** added to the tenant
dashboard's `SettingsForm`. `homeLoan` asserts a DSA relationship the operator
must verify; `vastuSectors` can fail the deployment for the five other tenants
sharing it. A tenant admin flipping either is a compliance or an availability
incident. Ruled during CD-02; this increment implements it and changes nothing
about the tenant-side form.

## Content / YAML Changes

**No `clients/*/` YAML file is created, edited or deleted.** No field's `_status`
changes, because no YAML field is added or altered. `pnpm check:content` output
for all six tenants must be identical before and after.

Two content-truth requirements the UI must honour:

1. **Never prefill a value that is not in the row.** Every input's
   `defaultValue` is the stored value or empty string. No placeholder text that
   looks like data, no "e.g." inside a value, no derived guesses. An empty field
   renders nothing on the public site; an invented one ships a lie on a real
   business's website.
2. **RERA.** `firm_registration_number` is the RERA registration for a
   `realestate` tenant and the ICAI FRN for a `cafirm` one. The label comes from
   `getVerticalConfig(row.vertical).footer.registrationLabel`, never hardcoded.
   The form must not offer to generate, infer or default it. `PropertyCard`'s
   "registration pending" state is untouched.
3. **ICAI.** Guard B2 above, plus the disabled control and its explanation on a
   `cafirm` tenant. `getVerticalConfig(vertical).defaults.reviewsEnabled` stays
   the creation-time default and is CD-03b's concern.

**Stale-YAML notice — required on the edit screen** (§10, CD-09 owns the fix):

> Edits made here are authoritative. This client's `clients/<slug>/` YAML files
> are now out of date, and `pnpm seed:client <slug> --force` would overwrite
> these edits.

Note it, do not solve it.

## Authorization

Designed first, because a hole here is not one tenant's bug.

- **Every new page**: `await requirePlatformAdmin(<its own path>)` as the first
  statement, before any query. Unauthenticated → 307 to
  `/login?next=<encoded path>`.
- **Every new Server Action**: `await requirePlatformAdmin("/")` as the first
  statement, inside the try, with `unstable_rethrow(error)` first in the catch.
  A rendered layout proves nothing; the action is a reachable POST endpoint and
  is treated as one.
- **The `clientId` in `FormData` is never trusted to describe the client** — it
  selects the row, and every guard then reads the freshly-loaded row.
- **No third auth system.** Platform auth (`lib/platform-auth.ts`,
  `gz_platform_session`, 1h, env credentials) and tenant auth (`lib/auth.ts`,
  `gz_session`, 8h, `users` table) both stay exactly as they are. The platform
  actions import **only** `lib/platform-auth.ts`; the tenant actions import only
  `lib/auth.ts`. Neither file gains a role, a user table, or a second operator —
  §12 puts multiple platform users explicitly out of scope.
- **`requirePlatformAdmin` is not weakened**, and neither is `assertOwnership` —
  §11 forbids both.
- **`/` and `/clients/**` carry `robots: { index: false, follow: false }`.**
  `/clients/[slug]` gets the same `metadata` block `app/page.tsx` already has.

**Escalation of the existing surface, stated honestly:** before this increment a
stolen or forgotten `gz_platform_session` cookie could read one client's slug
back and open its site. After it, that cookie can rewrite every client's business
details and switch their sites off. The mitigations that exist are the 1h expiry,
`httpOnly`, `sameSite: lax`, and `secure` in production. There is no audit trail
and no second factor. That is the accepted posture for a single-operator internal
tool; it is recorded here rather than left implicit, and Open Decision 5 raises
the audit gap.

## Tenant Isolation

- **`lib/content.ts` keeps its guarantee.** No query there loses its `clientId`
  scope; the change is additive (a tag) and every function keeps its `clientId`
  parameter and its `where`.
- **The platform read side is unscoped by design and lives in one file** that
  says so, `lib/platform/clients.ts`, reachable only from `/` and
  `/clients/[slug]`, both of which gate first.
- **Every platform write targets exactly one row** — `eq(clients.id, row.id)` or
  `eq(firmSettings.clientId, row.id)` — where `row` came from a database read
  keyed by the posted id. No bulk update, no `where` built from form input.
- **`app/site/[tenant]/**` must not import the platform modules.** Evidence:
  `grep -rn "lib/platform\|platform-actions" app/site components lib/content.ts lib/tenant.ts`
  → expect no output.
- **`customDomain` uniqueness** is enforced in the action precisely because two
  tenants sharing a domain is a cross-tenant resolution bug: `getTenant()`'s host
  branch and `submitQuery()`'s host branch both `.limit(1)` with no tiebreak, so
  one client's leads could land on another's row.
- **`isActive` now stops writes**, closing the path where a deactivated tenant's
  staff kept a working session.

## Failure Behaviour

| Condition | Behaviour |
|---|---|
| No platform session, page | `redirect("/login?next=…")` — 307 |
| No platform session, action | `redirect()` thrown, rethrown past the catch by `unstable_rethrow`, browser navigates to `/login` |
| Unknown slug at `/clients/<slug>` | `notFound()` — 404 |
| `clientId` not found in an action | `{ ok: false, message: "Client not found." }` |
| Any guard fails | `{ ok: false, message }` with the exact text above; **no partial write** — every guard runs before the `UPDATE` |
| `firm_settings` row missing | `{ ok: false, message: "This client has no settings row yet." }`; no insert |
| Database unreachable on `/` | **throws** — the error page, not an empty table. Commented, because the neighbouring `activeTenants()` swallow will otherwise look like the house pattern |
| Database error inside an action | caught, `fail(error)` returns the message; the transaction is a single `UPDATE`, so there is nothing partial to roll back |
| Two operators editing at once | last write wins, no optimistic locking. Accepted: one operator, §12. Recorded in Open Decision 5 |
| `realestate` row with an unresolvable `templateKey` | the list shows the template cell as an error state and the edit screen says the site does not resolve; `app/lookup-actions.ts` already explains it on the slug path |

## SEO and Indexing Impact

- **No public route's rendering mode, canonical, metadata or JSON-LD shape
  changes.** The only public-path edits are inside cached functions and
  `getTenant()`.
- **`/` and `/clients/**` are `noindex, nofollow`** and behind a 307 for anyone
  without a session. `robots.txt` is unchanged — `/clients` is not added to the
  disallow lists, matching exactly how `/` is treated today (see Open
  Decision 3).
- **Sitemaps now refresh on save** rather than on the 1h expiry, for the
  activate/deactivate and feature transitions that change membership. That is a
  freshness improvement; the URL **sets** for the six existing tenants must be
  identical before and after, compared **sorted** (finding 9).
- **Deactivation becomes real for crawlers**: pages 404 within seconds instead of
  up to ten minutes, and drop out of the sitemap at the same moment.
- **Pre-existing and not fixed here**: `/properties` returns a soft 404 for a
  404ing tenant, because `properties/loading.tsx` opens a Suspense boundary that
  flushes a 200 shell. Standing finding; AC 8's status-code evidence therefore
  uses the tenant **home page**, and the `/properties` soft 404 is recorded as
  unchanged rather than treated as a regression.
- **`clients.custom_domain` is NULL on all six rows** and remains so unless an
  operator sets one. `lib/sitemap.ts prefixFor()` and `lib/og.ts originFor()`
  short-circuit on host mode before reading it — unchanged.

## Analytics

No change. `lib/analytics.ts` and `components/analytics/GoogleAnalytics` are
untouched, and `ga4MeasurementId` is a CD-06 field that this form does not write.
The platform dashboard is internal, `noindex`, and carries **no** analytics
instrumentation — do not add any; it would send an internal operator's activity
to a client's GA4 property.

## Evidence Required

There is no test suite. `package.json` has no `test`, `lint` or `typecheck`
script — do not invent one. **`pnpm build` is the typecheck** (~2 min, 9,659
pages). **`pnpm dry-run` is stale — do not run it.**

**Build hazards, already diagnosed:**
- Postgres `53300` (*too many clients*) → a **CD-00 regression**, **stop and
  escalate**.
- Postgres `53200` (*out of memory*) → known machine memory pressure on
  consecutive builds → **retry once with the machine otherwise idle**.

**Tree state.** CD-00/01/02 are complete but uncommitted, so `git diff` does not
isolate this increment. `work/CD-03a-dashboard-list-edit/pre-state.txt` holds the
69-entry `git status --porcelain` snapshot taken before CD-03a. Every report must
attribute changes with:

```bash
git status --porcelain | sort > work/CD-03a-dashboard-list-edit/post-state.txt
diff <(sort work/CD-03a-dashboard-list-edit/pre-state.txt) work/CD-03a-dashboard-list-edit/post-state.txt
```

Everything the diff adds is CD-03a's. Expect `drizzle/` and `lib/db/schema.ts`
to be **absent** from that delta.

**Order is mandatory.** Baselines on the clean tree first; all mutation testing
against the *after* server, between the two builds; the guinea pig's rows
restored and verified by SQL **before** the after-build starts.

Unless stated otherwise, run the server as `pnpm start` after `pnpm build` —
`pnpm dev` does not exercise the ISR route cache, and the revalidation evidence
is meaningless without it.

### Build

**1. Baseline, unmodified tree.**

```bash
rm -rf .next && pnpm build 2>&1 | tee work/CD-03a-dashboard-list-edit/build-before.txt
find .next/server/app/site -name '*.html' | sed 's|.*/site/||' | cut -d/ -f1 \
  | sed 's/\.html$//' | sort | uniq -c | tee work/CD-03a-dashboard-list-edit/prerendered-before.txt
```

**Hard gate — these six figures exactly:**

```
     42 arora-k-associates
    546 evergreen-real-estate
    547 expert-realtors
   5005 high-properties
   1071 nayra-realtors
   1071 urban-flat-real-estate
```

If the fresh baseline differs, **stop and escalate**: the tree has drifted since
CD-02 and the primary regression signal is untrustworthy.

**2. Per-family baseline** (the aggregate says *something* moved, not *what*):

```bash
for t in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  printf '%-24s home-loan=%-5s vastu-gurugram=%-5s property-management=%s\n' "$t" \
    "$(find ".next/server/app/site/$t/home-loan" -name '*.html' 2>/dev/null | wc -l)" \
    "$(find ".next/server/app/site/$t/vastu/gurugram" -name '*.html' 2>/dev/null | wc -l)" \
    "$(ls ".next/server/app/site/$t/property-management.html" 2>/dev/null | wc -l)"
done | tee work/CD-03a-dashboard-list-edit/families-before.txt
```

Expected shape: `home-loan` non-zero for `high-properties`, `nayra-realtors`,
`urban-flat-real-estate` and 0 for the other two; `vastu-gurugram` non-zero
**only** for `high-properties`; `property-management=1` **only** for
`high-properties`.

**3. `proxy.ts` hash, before and after** — it *will* change:

```bash
sha256sum proxy.ts lib/db/schema.ts drizzle/meta/_journal.json
```

`lib/db/schema.ts` and `drizzle/meta/_journal.json` must be **identical** in both
runs. `proxy.ts` will differ; show `git diff proxy.ts` and confirm it is the
`clients` exemption plus the rewritten `/` comment and nothing else.

**4. After implementing:** rerun 1, 2 and 3 into `*-after.txt`, then

```bash
diff work/CD-03a-dashboard-list-edit/prerendered-before.txt work/CD-03a-dashboard-list-edit/prerendered-after.txt
diff work/CD-03a-dashboard-list-edit/families-before.txt     work/CD-03a-dashboard-list-edit/families-after.txt
```

**Expected: no output from either.** A count that drops is a failure, not a
detail. "The build is green" is not evidence — a broken `generateStaticParams`
reports success.

### Rendered pages (per tenant)

Run against `pnpm start` on `http://localhost:3000`, before and after, with the
guinea pig fully restored.

**5. Six-tenant status sweep.** Base paths:

```
/realestate/temp-premium-v2/high-properties
/realestate/temp-premium-v2/evergreen-real-estate
/realestate/temp-premium-v2/expert-realtors
/realestate/temp-premium-v2/nayra-realtors
/realestate/temp-premium-v2/urban-flat-real-estate
/cafirm/arora-k-associates
```

Paths per real-estate base: `/`, `/properties`, `/localities`, `/contact`,
`/faq`, `/calculators`, `/updates`, `/sectors`, `/builders`, `/vastu`,
`/area-converter`, `/rental-yield`, `/maps/gurgaon`, `/home-loan`,
`/property-management`. Per the cafirm base: `/`, `/services`, `/contact`,
`/faq`, `/calculators`, `/updates`, `/firm-profile`.

```bash
for base in <the six>; do for p in <that base's paths>; do
  printf '%s%s %s\n' "$base" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$base$p")"
done; done | sort | tee work/CD-03a-dashboard-list-edit/status-before.txt
```

Compare before/after with `diff`. **A path that is legitimately 404 for a tenant
must be 404 in both runs** — the comparison is before-vs-after, not
"everything 200".

**6. Sitemap URL sets, sorted.** `sitemapClients()` has no `ORDER BY` and this
increment writes to `clients`, so raw output reshuffles. Sort or the diff lies:

```bash
for f in core properties register localities updates services maps home-loan area-converter vastu vastu-sectors; do
  curl -s "http://localhost:3000/sitemaps/$f.xml" | grep -o '<loc>[^<]*</loc>' | sort \
    > "work/CD-03a-dashboard-list-edit/sitemap-$f-before.txt"
done
wc -l work/CD-03a-dashboard-list-edit/sitemap-*-before.txt
```

After: same, into `-after.txt`, then `diff` each pair. **Expected: no output.**

**7. AC 1 — the list, and its gate.**

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/
# expected: 307 http://localhost:3000/login?next=%2F
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/clients/urban-flat-real-estate
# expected: 307 .../login?next=%2Fclients%2Furban-flat-real-estate
#           NOT 307 to "/" — that would mean the proxy exemption is missing
```

Then sign in (`curl -c jar -X POST` against the `loginPlatformAdmin` action, or a
browser session exported to a cookie jar) and:

```bash
curl -s -b jar http://localhost:3000/ | grep -c 'noindex'          # expected: >= 1
for s in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate arora-k-associates; do
  printf '%s %s\n' "$s" "$(curl -s -b jar http://localhost:3000/ | grep -c "$s")"
done                                                                # expected: all >= 1
```

**8. AC 4 / Auth — direct POST to every new action, unauthenticated.** A rendered
layout is not evidence. Recover the action ids from the build:

```bash
node -e "const m=require('./.next/server/server-reference-manifest.json');
  for (const [id, e] of Object.entries(m.node ?? {})) {
    const s = JSON.stringify(e);
    if (s.includes('platform-actions')) console.log(id, s.slice(0,160));
  }"
```

For **each** of the three ids:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -X POST \
  http://localhost:3000/clients/urban-flat-real-estate \
  -H "Next-Action: <id>" \
  -F 'clientId=<urban-flat uuid>' -F 'displayName=HACKED' -F 'firmName=HACKED' -F 'vastuSectors=on'
```

Then prove nothing moved:

```sql
SELECT slug, display_name, custom_domain, is_active, features FROM clients WHERE slug='urban-flat-real-estate';
SELECT firm_name, phone, updated_at FROM firm_settings
  WHERE client_id=(SELECT id FROM clients WHERE slug='urban-flat-real-estate');
```

Record the rows before and after the three POSTs. **Expected: byte-identical,
including `updated_at`.**

**9. AC 3 — `slug` and `vertical` immutable, by direct POST.** With a valid
platform cookie:

```bash
curl -s -b jar -X POST http://localhost:3000/clients/urban-flat-real-estate \
  -H "Next-Action: <updateClientIdentity id>" \
  -F 'clientId=<uuid>' -F 'displayName=Urban Flat Real Estate' \
  -F 'slug=urban-flat-renamed' -F 'vertical=cafirm' -F 'isActive=on'
```

Record the refusal message. Then `SELECT slug, vertical FROM clients WHERE
id='<uuid>';` → unchanged. A disabled input is not evidence for this AC.

**10. AC 5 — ICAI refusal.** On `arora-k-associates` (a read-only guard test; the
row must not change):

```bash
curl -s -b jar -X POST http://localhost:3000/clients/arora-k-associates \
  -H "Next-Action: <updateClientBusinessDetails id>" \
  -F 'clientId=<arora uuid>' -F 'firmName=Arora K & Associates' -F 'reviewsEnabled=on'
```

Record the message. `SELECT reviews_enabled, updated_at FROM firm_settings WHERE
client_id='<arora uuid>';` → `false`, `updated_at` unchanged (proving the whole
save was refused, not partially applied).

**11. AC 6 — the vastu guards. Never enable it on a second tenant.**

*(a) The reachable half, executed for real* — `urban-flat-real-estate`, no ack:

```bash
curl -s -b jar -X POST http://localhost:3000/clients/urban-flat-real-estate \
  -H "Next-Action: <updateClientFeatures id>" \
  -F 'clientId=<uuid>' -F 'propertyMap=on' -F 'homeLoan=on' -F 'homeLoanDsaConfirmed=on' -F 'vastuSectors=on'
```

Expected: refused, message naming the **live** count (`1 tenant:
high-properties`) and `~3,700` routes. `SELECT features FROM clients WHERE
id='<uuid>';` → unchanged.

*(b) The cap branch, which must never be created in the database* — probe the
pure function:

```bash
cat > work/CD-03a-dashboard-list-edit/vastu-probe.ts <<'EOF'
import { vastuDecision, VASTU_TENANT_CAP } from "../../lib/platform/feature-copy";
console.log("cap =", VASTU_TENANT_CAP);
console.log("0 enabled, no ack :", vastuDecision([], false));
console.log("0 enabled, ack    :", vastuDecision([], true));
console.log("1 enabled, no ack :", vastuDecision(["high-properties"], false));
console.log("1 enabled, ack    :", vastuDecision(["high-properties"], true));
console.log("3 enabled, ack    :", vastuDecision(["a","b","c"], true));
EOF
npx tsx work/CD-03a-dashboard-list-edit/vastu-probe.ts
```

Expected: `ok` for the first two and the fourth; refusal naming §11 for the
third; refusal naming the **build limit and the 41-minute failed deploy** for the
fifth, `acked` notwithstanding. Then show the constant has exactly one
definition:

```bash
grep -rn "VASTU_TENANT_CAP\|VASTU_ROUTES_PER_TENANT\|3700\|3,700" lib components app | sort
```

Expected: one definition each in `lib/platform/feature-copy.ts`; every other hit
is a use of the constant or prose in the CD-02 gate-module comments. **No literal
`3` or `3700` in `platform-actions.ts` or `FeatureToggles.tsx`.**

**12. AC 7 — the DSA confirmation, full round trip on the guinea pig.**
`urban-flat-real-estate` already has `homeLoan: true`, so the enable transition
must be created and then restored:

1. `SELECT features FROM clients WHERE slug='urban-flat-real-estate';` — record
   verbatim; this is the restore target.
2. POST `updateClientFeatures` with `homeLoan` **absent** → succeeds. Verify
   `features` and that `/realestate/temp-premium-v2/urban-flat-real-estate/home-loan`
   now returns 404 (a second, independent proof that the tag reaches prerendered
   HTML).
3. POST with `homeLoan=on` and **no** `homeLoanDsaConfirmed` → refused; record
   the message; `features` unchanged.
4. POST with `homeLoan=on` **and** `homeLoanDsaConfirmed=on` → succeeds;
   `/home-loan` returns 200 again.
5. `SELECT features FROM clients WHERE slug='urban-flat-real-estate';` → equals
   step 1 verbatim. **This must pass before the after-build is started.**

**13. AC 2 — revalidation, the headline.** Self-validating so it does not depend
on guessing which field renders:

```bash
# 1. confirm the field renders at all, and capture the current value
psql -c "SELECT phone FROM firm_settings WHERE client_id=(SELECT id FROM clients WHERE slug='urban-flat-real-estate');"
curl -s http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate/ | grep -c '<current phone>'
# expected: >= 1. If 0, pick another rendered field and repeat before proceeding.

# 2. edit through the form (browser) or the action, and start the clock
date +%s
# 3. poll
for i in $(seq 1 12); do
  printf '%s %s\n' "$(date +%s)" \
    "$(curl -s http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate/ | grep -c '<new phone>')"
  sleep 5
done
```

**Expected: a non-zero count within the first poll or two — well under 60
seconds, against a ~600-second uncached window.** Record the elapsed seconds.
Then restore the original value and confirm it comes back just as fast. If this
takes minutes, the tag is not reaching the ISR entry and the increment has not
done its job.

**14. AC 8 — deactivate / reactivate, both halves.**

```bash
# deactivate through the form or updateClientIdentity with isActive absent
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate/
# expected: 404, within seconds
```

Use the tenant **home page** for the status code. Record `/properties`
separately and note that it returns 200 with the not-found body — the
pre-existing `loading.tsx` soft 404, unchanged by this increment.

Actions refuse, with no session required — direct POST of the lead form's action
to that tenant's `/contact`:

```sql
SELECT count(*) FROM queries WHERE client_id=(SELECT id FROM clients WHERE slug='urban-flat-real-estate');
```
before and after the POST. **Expected: unchanged.** Then reactivate, repeat the
status check (200) and confirm the tenant reappears in
`curl -s http://localhost:3000/sitemaps/core.xml | grep -c urban-flat-real-estate`.
Delete any test `queries` row created and say so.

**15. AC 9 — the prototype probe.**

```bash
npx tsx -e "import {tenantSlugForHost} from './lib/domains';
for (const h of ['constructor','Constructor:3000','__proto__','toString','hasOwnProperty','highproperties.in','www.highproperties.in','unknown.example'])
  console.log(h, '->', JSON.stringify(tenantSlugForHost(h)));"
```

Run twice: with `PRIMARY_TENANT_SLUG` unset (expect `null` for every junk host,
`"high-properties"` for the two mapped ones) and with
`PRIMARY_TENANT_SLUG=high-properties` (expect `"high-properties"` everywhere).
**Never a function, never `[Function: Object]`.** Record the pre-fix output too —
it is what makes the fix legible.

### Database checks

**16. Full `clients` snapshot, before and after.** This is the definitive
regression check for the six tenants' configuration:

```sql
SELECT slug, vertical, template_key, is_active, custom_domain, is_demo, features
FROM clients ORDER BY slug;
```

Capture to `clients-before.txt` / `clients-after.txt` and `diff`. **Expected: no
output** — every mutation in the evidence is on `urban-flat-real-estate` and is
restored.

**17. `firm_settings` snapshot for the guinea pig and for `high-properties`:**

```sql
SELECT client_id, firm_name, phone, reviews_enabled, pricing_enabled, awards_enabled,
       client_logos_enabled, team_enabled, opening_hours, social_links, updated_at
FROM firm_settings
WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('urban-flat-real-estate','high-properties'))
ORDER BY client_id;
```

`high-properties` must be **byte-identical including `updated_at`** — it is never
touched. `urban-flat-real-estate` must match on every column except
`updated_at`, which moves as a consequence of the restore writes.

**18. `social_links` merge proof.** Before any edit, note that
`high-properties.social_links` holds `instagram`, `facebook`, `linkedin` and no
`youtube`. On the guinea pig, add a key the form does not render:

```sql
UPDATE firm_settings SET social_links = social_links || '{"twitter":"https://x.test/probe"}'::jsonb
 WHERE client_id=(SELECT id FROM clients WHERE slug='urban-flat-real-estate');
```

Then save the business-details panel with the four managed keys and confirm
`twitter` **survives**. Remove the probe key afterwards. A blind jsonb replace
would delete it silently, which is the failure this proves against.

**19. No migration.**

```bash
git status --porcelain drizzle lib/db/schema.ts
```

**Expected: no output beyond whatever `pre-state.txt` already lists.**

### Content checks

**20. No YAML changed, and the checklists are unmoved:**

```bash
git status --porcelain clients/          # expected: only the entries already in pre-state.txt
pnpm check:content high-properties       # expected: PENDING 3, PLACEHOLDER 3, as in current-status.md
pnpm check:content arora-k-associates    # expected: 11 placeholder, 9 pending
```

**21. The comment rewrites — the deliverable CD-02 failed on.** Every one of
these must return **no output**:

```bash
grep -rn "no client listing\|never lists clients\|no listing is ever rendered" app proxy.ts AGENTS.md
grep -rn "template-library pages\|/admin" lib/platform-auth.ts
grep -rn "an edit shows up within this window rather than instantly" lib/content.ts
grep -rn "CD-03 owns closing it\|deliberately deferred: CD-03" lib/tenant.ts
```

And these must return the **new** text (show it in full in the report):

```bash
sed -n '1,30p' app/page.tsx
sed -n '1,25p' app/lookup-actions.ts
sed -n '1,15p' lib/platform-auth.ts
sed -n '/isActive/,/^  if (!row.isActive)/p' lib/tenant.ts
grep -n "CD-03" lib/premium-v2/home-sections.ts lib/vastu/enabled.ts lib/home-loan/enabled.ts
```

The last one must show that every `CD-03` reference now names the concrete module
(`lib/actions/platform-actions.ts` / `components/platform/FeatureToggles.tsx`)
rather than a future increment. **The reasoning paragraphs themselves must
survive** — they are the source of the on-screen helper text, and deleting them
would leave the UI text with no provenance.

**22. Isolation greps** — each must return no output:

```bash
grep -rn "lib/platform\|platform-actions" app/site components/realestate components/dashboard lib/content.ts lib/tenant.ts
grep -rn "\"use client\"" -l components/platform | xargs grep -ln "lib/db\|lib/content\|lib/tenant\|lib/platform/clients"
grep -rn "revalidateTag" lib app components
grep -rn "headers()" "app/site/[tenant]/(public)" --include=*.tsx | grep -v loading.tsx
```

The third confirms `updateTag` was used rather than the deprecated call. The
fourth confirms no public page gained a dynamic API (the known `loading.tsx`
exception is pre-existing and excluded deliberately).

## Expected Files / Modules

**New (9):**

| Path | Kind |
|---|---|
| `lib/cache-tags.ts` | server/client-safe, imports nothing |
| `lib/platform/feature-copy.ts` | server/client-safe, imports nothing but the `FeatureKey` type |
| `lib/platform/clients.ts` | server-only read side |
| `lib/actions/platform-actions.ts` | `"use server"` |
| `app/clients/[slug]/page.tsx` | Server Component |
| `components/platform/form-primitives.tsx` | `"use client"` |
| `components/platform/ClientIdentityForm.tsx` | `"use client"` |
| `components/platform/BusinessDetailsForm.tsx` | `"use client"` |
| `components/platform/FeatureToggles.tsx` | `"use client"` |

**Modified (12):**

| Path | Change |
|---|---|
| `app/page.tsx` | client list + comment rewrite |
| `proxy.ts` | `clients` exemption + comment rewrite |
| `lib/tenant.ts` | tagged per-slug cache, `isActive` on both `getTenant()` branches, comment rewrite |
| `lib/content.ts` | `cachedForClient` + 4 call sites, header comment rewrite |
| `lib/auth.ts` | `isActive` predicate |
| `lib/actions/auth-actions.ts` | `isActive` predicate |
| `lib/actions/submit-query.ts` | `isActive` predicate, both branches |
| `lib/domains.ts` | `Object.hasOwn` fix + comment |
| `lib/platform-auth.ts` | header comment rewrite |
| `app/lookup-actions.ts` | comment rewrite |
| `lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`, `lib/home-loan/enabled.ts` | `CD-03` → concrete module names |
| `AGENTS.md` | the "renders **no client listing**" line |

**Untouched, and this is checkable:** `lib/db/schema.ts`, `drizzle/**`,
`lib/static-params.ts`, `lib/features.ts`, `lib/templates/index.ts`,
`lib/sitemap.ts`, `lib/verticals/**`, everything under `app/site/[tenant]/`,
`components/realestate/**`, `components/dashboard/**`, `clients/**`,
`scripts/**`, `package.json`.

### The comment rewrites, verbatim

**`app/page.tsx`** — replace the header block with:

```
/**
 * The single gated entry point to this deployment: the client list, and the
 * slug box as the fast path into a site whose ID the operator already knows.
 *
 * This file used to say it "deliberately shows no client listing", so that
 * nobody browsing here could discover a client they did not already know the
 * slug for. That is reversed on purpose, and the reason it was reversed is
 * that the reasoning was never sound: `/` is gated by `requirePlatformAdmin`,
 * so anyone who can see this page has already authenticated, and anyone who
 * has not sees `/login`. Slug obscurity was protecting nothing from anybody,
 * while costing the operator the ability to answer "which clients do we have".
 * Access is controlled by the platform login. It is not controlled by what
 * this page declines to render.
 */
```

**`app/lookup-actions.ts`** — replace the `lookupClient` header with:

```
/**
 * The fast path from the dashboard into a client's site: type the ID, go
 * straight there. Not the only path any more — `app/page.tsx` lists every
 * client with a direct link — but the quick one for an operator who already
 * knows the slug. Case/whitespace-insensitive since slugs are typed by hand
 * here, unlike everywhere else they are generated from a form.
 */
```

**`lib/platform-auth.ts`** — replace the header with:

```
/**
 * Gates the internal platform dashboard: `/` (the client list) and
 * `/clients/**` (the per-client edit screens). There is no `/admin` section and
 * no public template-library page — `/` itself is the single gated dashboard,
 * as AGENTS.md describes.
 *
 * A single shared operator login from environment variables, so it deliberately
 * does not touch the `users`/`clients` tables `lib/auth.ts` uses for per-tenant
 * dashboards; the two systems share nothing but the signing secret. Individual
 * client sites (`/{vertical}/{template}/{slug}/...`) are never gated by this.
 *
 * `requirePlatformAdmin` redirects, which is right for a page and a trap in a
 * Server Action: `redirect()` throws, and an action whose catch returns the
 * error as a message will report "NEXT_REDIRECT" to the operator. Platform
 * actions call `unstable_rethrow(error)` first in their catch for that reason.
 */
```

**`lib/tenant.ts`** — the `isActive` block in `getTenantBySlug` loses the
"deferred to CD-03" paragraph and gains the truth:

```
  // An inactive tenant is off the air, not merely unlisted, and that now holds
  // for writes as well as renders. Rendered surfaces resolve through this
  // function; the mutating paths do not — they each run their own `clients`
  // query — so the same `isActive` predicate is applied at each of them:
  // `getTenant()` below (both branches), `getSessionUser()` in lib/auth.ts,
  // `login()` in lib/actions/auth-actions.ts, and both branches of
  // lib/actions/submit-query.ts. A deactivated tenant's staff holding a live
  // `gz_session` can no longer sign in, run a dashboard action, or have a lead
  // written on their behalf.
  //
  // The one surface still outside this guard is
  // `(public)/properties/loading.tsx`, which reads `getTenant()` and flushes a
  // Suspense shell with a 200 before the page body 404s — the standing soft-404
  // finding, pre-existing and still open.
  //
  // Deactivation takes effect within seconds rather than at the 300s expiry:
  // `lookupClientBySlug` above carries `tenantSlugTag(slug)` and the platform
  // actions expire it on save.
  //
  // Not a lock-out: reactivation is an operator action, never a tenant one.
```

**`lib/content.ts`** — the header's last paragraph, which the tag falsifies:

```
 * `REVALIDATE_SECONDS` is how long an UNOBSERVED change may go unnoticed. It is
 * no longer the latency of a dashboard edit: the clientId-scoped reads below
 * carry `tenantDataTag(clientId)` and the platform actions in
 * lib/actions/platform-actions.ts expire it on save, so an edit is live on the
 * next request. Note that the tenant dashboard's own actions do NOT yet do
 * this — see lib/actions/dashboard-actions.ts.
```

(The last sentence stands or falls with Open Decision 1; if the tenant actions
are repaired in this increment, drop it.)

**`proxy.ts`** line 68-70:

```
  // The bare root is the single gated dashboard (app/page.tsx) — team-only, and
  // since CD-03a it lists every client rather than requiring a slug typed in by
  // hand. Reached only through `requirePlatformAdmin`.
```

**`AGENTS.md`** — replace *"and it deliberately renders **no client listing**"*
with *"and it lists every client for the signed-in team member; access is
controlled by the platform login rather than by slug obscurity"*.

## Implementation Sequence

Each step is small enough to reason about, and the order puts every shared-module
change before the first line of UI, so a mistake in the caching layer surfaces at
step 7's build rather than three files later.

1. **Baselines.** Steps 1–3 and 5–6 of *Evidence Required*, on the clean tree:
   `build-before`, `prerendered-before`, `families-before`, `status-before`,
   `sitemap-*-before`, `clients-before`, hashes, `pre-state.txt` already exists.
2. `lib/cache-tags.ts` — new, imports nothing.
3. `lib/tenant.ts` — per-slug tagged `unstable_cache`; `isActive` on both
   `getTenant()` branches; rewrite the `isActive` comment.
4. `lib/content.ts` — `cachedForClient`, four call sites, the `getPropertyImagesFor`
   comment, the header rewrite.
5. `lib/auth.ts`, `lib/actions/auth-actions.ts`, `lib/actions/submit-query.ts` —
   one predicate each.
6. `lib/domains.ts` — `Object.hasOwn` + comment. Run the AC 9 probe now, while
   the before/after contrast is still available.
7. **Intermediate `pnpm build`.** Everything so far is on every tenant's path and
   no UI depends on it yet, so a failure here is unambiguous. Compare the
   per-tenant counts against `prerendered-before.txt`; they must already match.
8. `lib/platform/feature-copy.ts` — constants, copy, `vastuDecision`. Run the
   vastu probe (Evidence 11b) immediately; it needs nothing else to exist.
9. `lib/platform/clients.ts` — the three read functions.
10. `lib/actions/platform-actions.ts` — the three actions, their guards, the two
    invalidation helpers.
11. `components/platform/form-primitives.tsx`, then the three forms.
12. `app/clients/[slug]/page.tsx`.
13. `proxy.ts` — the `clients` exemption and the `/` comment. Verify
    `/clients/<slug>` now 307s to `/login`, not to `/`.
14. `app/page.tsx` — the list, the search, the retained lookup form, the comment.
15. Comment sweep: `lib/platform-auth.ts`, `app/lookup-actions.ts`, the three
    gate modules, `AGENTS.md`. Run Evidence 21 as the checklist.
16. **Final `pnpm build`**, then `pnpm start`, then Evidence 5–20 in order.
    Restore the guinea pig and run Evidence 16 **before** declaring done.

## Acceptance Criteria Mapping

| AC | Design | Evidence |
|---|---|---|
| 1. `/` lists all six behind platform auth; still `noindex`; unauth → `/login` | `app/page.tsx` + `listClientsForPlatform()`; `requirePlatformAdmin("/")`; existing `metadata.robots` kept | 7 |
| 2. Business-detail edit visible on the public site without waiting out the window | `tenantDataTag` on `getFirmSettings`, `updateTag` in `updateClientBusinessDetails`; ISR entries inherit the tag through the layout | 13 |
| 3. `slug`/`vertical` immutable, proven by direct POST | never in any `.set()`; guards I1/I2 | 9 |
| 4. Every mutating action re-checks `requirePlatformAdmin()`; `clientId` from FormData not trusted | the mandatory preamble; row re-read; guards read the row | 8 |
| 5. `reviewsEnabled` refused for `cafirm` | guard B2 on `row.vertical` | 10 |
| 6. Fourth `vastuSectors` refused with the build-limit reason; second surfaces §11 with the count | `vastuDecision` + `vastuSectorTenants()`; count is a prop and a message argument | 11a (executed), 11b (pure probe) |
| 7. `homeLoan` without DSA confirmation refused | guard F2 on the transition | 12 |
| 8. Deactivate 404s pages **and** stops actions; reactivate restores | `isActive` in four write paths + `updateTag` for the rendered side | 14 |
| 9. `tenantSlugForHost("constructor")` never a function | `Object.hasOwn` + explicit fallback | 15 |
| 10. Six tenants render identically; counts, sweep, sitemap sets unchanged | nothing under `app/site/**` or `components/realestate/**` touched | 1–2, 4, 5, 6, 16, 17 |
| 11. `app/page.tsx`'s comment rewritten | verbatim text above | 21 |

## Non-Goals

- **Creating a client** — CD-03b. No "New client" button, no wizard, no
  transaction, no generated password, no slug validation, no `SLUG_PATTERN`
  import.
- **`sitemapClients()`'s missing template filter** — CD-03b, which is what makes
  a half-configured client possible.
- **Deleting a client.** `onDelete: cascade` is on every content table. Build
  deactivate.
- **GBP autofill** (CD-04), **logo/favicon/OG upload** (CD-05), **the SEO panel**
  (CD-06 — `seoTitle`, `seoDescription`, `ga4MeasurementId`,
  `searchConsoleVerification` are deliberately absent from this form), **hero
  copy** (CD-07), **team/office screens** (CD-08).
- **Exposing `templateKey`** — displayed read-only, ruled above.
- **Multiple platform users or roles** — §12.
- **Making the vertical nav feature-aware** (the `/property-management` 404 on
  four live sites) — separate, and it touches `lib/verticals/**`.
- **Regenerating `clients/<slug>/` YAML after an edit** — CD-09. Noted on screen,
  not solved.
- **Any migration**, index or constraint. If one seems necessary, raise a
  blocker.
- **An audit log** — see Open Decision 5.

## Open Decisions

**1. Repair the ~30 dead `revalidatePath` calls in
`lib/actions/dashboard-actions.ts`?** Established above that every one is a
no-op, so tenant-dashboard edits have never propagated except by expiry.
*Argument to fix now:* it is a live defect on six real sites, the mechanism is
already being built here, and the fix is mechanical — replace each pair with
`updateTag(tenantDataTag(user.clientId))` plus, where the slug is available,
`updateTag(tenantSlugTag(slug))`. *Argument to defer:* it touches 15 actions
across property, locality, update, compliance and calculator surfaces, none of
which this increment's evidence exercises, and it would roughly double the diff
of the first increment that writes. **Recommendation: defer to its own increment
(CD-03c), and record the finding in `current-status.md` now, with the
`lib/content.ts` comment naming it explicitly so the next reader does not
rediscover it.** Manager to rule.

**2. A partial unique index on `clients.custom_domain`.** Application-level
uniqueness is enforced here; the durable fix is
`CREATE UNIQUE INDEX ... ON clients (lower(custom_domain)) WHERE custom_domain IS NOT NULL`.
That is a migration, and no schema change is expected in this increment.
**Recommendation: defer, and let CD-03b carry it** — that increment already
writes a migration-shaped change to `sitemapClients()` and creates rows.

**3. Add `/clients` to `robots.txt`'s path-mode disallow list?** The route is
`noindex` and 307s without a session, exactly as `/` does today, and `/` is not
in the disallow list. Adding one without the other is inconsistent.
**Recommendation: no change; match `/`'s existing treatment.** If the manager
wants defence in depth, add **both** `/` and `/clients` to the path-mode array
only — never to the host-mode array, where `/` is a client's public homepage.

**4. Add `.orderBy(clients.slug)` to `sitemapClients()`.** The standing finding
asks for it, and this increment is what makes `clients` writes routine, so
sitemap output will now reshuffle on every save. One line, no URL-set change.
The evidence sorts regardless, so it is not required for verification.
**Recommendation: include it** — it costs one line and makes every future sitemap
diff meaningful. Outside the task's named scope, so the manager rules.

**5. No audit trail.** Nothing records who changed what. With one env-based
operator the "who" is trivially known, but the "what" and "when" are not — the
only trace of a platform edit is `firm_settings.updated_at`, and `clients` has no
`updated_at` at all. Not proposed here (it is a schema change), but a platform
that can switch a live client's site off with no record is worth an explicit
decision rather than silence.

**6. `latitude`/`longitude` as `varchar(32)`.** The house rule is `real` for a
value quoted to a decimal. Changing it is a migration and would drift this
increment into CD-03b, so the design adds application-level validation instead.
**Recommendation: leave the columns, keep the validation, and revisit when
another migration is being written anyway.**

**7. Server-side acknowledgement for the *second* vastu tenant.** The task
requires the UI to surface §11 for the second and the action to hard-refuse the
fourth. This design goes further and requires the acknowledgement **server-side**
for any new tenant, because §11's corrected wording is "any tenant beyond those
that already have it" and a warning the action does not enforce is advice next to
a switch — which is exactly what `lib/vastu/enabled.ts` says CD-03 must replace.
Reversible in one line if the manager prefers the literal AC.

## Architecture Conflicts

**1. `revalidatePath` in `dashboard-actions.ts` does nothing, and the tenant
dashboard says "Settings saved."** Resolved above as a pre-existing defect, not
introduced here. It creates a live inconsistency for the duration of Open
Decision 1: platform edits propagate in seconds, tenant edits do not propagate at
all. The `lib/content.ts` comment must state that asymmetry rather than let a
reader assume the tag covers both.

**2. The "no client listing" decision is reversed.** Deliberate, mandated by
§3, and recorded in three rewritten comments rather than silently dropped. The
new reasoning is that the old one was never sound — `/` was always gated, so
obscurity protected nothing.

**3. `proxy.ts` is no longer byte-identical to CD-01's recorded hash.** Expected
and accounted for. The change is four lines of URL parsing with no database
access, and the six-tenant status sweep is what proves no tenant URL regressed.
The alternative — hanging the edit screen off `/?client=<slug>` to avoid touching
the file — was rejected: it conflates two screens on one route, gives CD-03b no
home for `/clients/new`, and buys nothing, since a segment exemption cannot
affect a tenant URL (segment 0 is always the vertical).

**4. `lib/verticals/index.ts` carries a fourth instance of the prototype-chain
defect class.** `getVerticalConfig` uses a bare index and `isVerticalId` uses
`in`, so `isVerticalId("constructor")` returns true. `proxy.ts` calls
`isVerticalId` on **every request**, so `/constructor/<anything>` currently
rewrites instead of redirecting — the same shape as the bug Amendment 1 closed
in `lib/templates/index.ts`, which returned 200 on a live client's site. It fails
closed downstream (`getTenant()` compares `x-tenant-vertical` against
`row.vertical`), so it is a duplicate-URL and misroute issue rather than a
disclosure one. **Not fixed here**: this increment never writes `vertical`, the
task assigns only `lib/domains.ts`, and adding a fifth file to the shared-path
diff of the first writing increment is the wrong trade. **Recorded as a new
standing finding** for `current-status.md`, with `proxy.ts`'s per-request call
site named — it belongs with the increment that next touches vertical resolution.

**5. `getPropertyImagesFor` cannot carry a tenant tag.** It is keyed by property
ids and never receives a `clientId`, so a platform or tenant edit cannot expire
it. Nothing in this increment writes property images, so no behaviour is wrong
today; it is noted so that whoever adds a property-image write path knows the tag
does not reach it.

**6. The platform read side is deliberately unscoped**, in direct tension with
the "every query is scoped by `clientId`" non-negotiable. Resolved by confining
it to `lib/platform/clients.ts`, stating the exception in that file's header,
gating both call sites, and proving by grep that nothing under
`app/site/[tenant]/` imports it.

## Manager Approval

APPROVED

The Next 16 caching analysis is the best work this pipeline has produced, and I
verified it in the source rather than accepting it, because the entire
invalidation design rests on it:

- `revalidatePath(path)` emits exactly one tag, `_N_T_<path>`
  (`revalidate.js:91`). `getImplicitTags` → `getDerivedTags` converts every
  non-`page` prefix of the **route pattern** into a `…/layout` tag
  (`implicit-tags.js:27-33`) and separately adds the resolved pathname
  (`:70-71`). So an entry carries `_N_T_/site/[tenant]/(public)/layout` and
  `_N_T_/site/<slug>/properties` — **never `_N_T_/site`**. The call matches
  nothing, and no warning fires because the missing-`type` warning is gated on
  `isDynamicRoute(originalPath)` (`:94`) and `"/site"` has no dynamic segment.
  **Confirmed: all ~30 calls are no-ops, and tenant-dashboard edits have never
  propagated except by 300s expiry.**
- `revalidateTag(tag)` single-arg is deprecated in 16.3.3 with a console warning
  naming `updateTag` (`revalidate.js:44`); `updateTag` exists, is exported from
  `next/cache`, and throws outside a Server Action (`:54-59`). **Using
  `updateTag` is correct, and `revalidateTag(tag, "max")` would have made AC 2
  fail intermittently.**
- `isVerticalId("constructor")` returns `true` and `getVerticalConfig` returns a
  function — Architecture Conflict 4 confirmed independently.

Reviewed against the stage-3 bar: every AC maps to concrete implementation;
authorization is designed first and every action carries the mandatory preamble;
the platform read side's deliberate departure from `clientId` scoping is
confined, documented and grep-provable; no migration; cache keys keep the
slug/clientId in `keyParts` (the `unstable_cache` tags-fixed-at-wrap-time trap is
correctly identified and spelled out); rendering strategy stated; scope bounded
against CD-03b; blast radius named per shared file.

### Rulings on Open Decisions

1. **Repair the dead `revalidatePath` calls — DEFER, but scheduled, not just
   noted.** Your reasoning is right: 15 actions across surfaces this increment's
   evidence never exercises, doubling the diff of the first increment that
   writes, is the wrong trade. But "recorded in `current-status.md`" is how a
   finding quietly becomes permanent. I am creating **`work/CD-03c-revalidation-repair/task.md`**
   so it is a scheduled increment with a slot in the run order. The
   `lib/content.ts` comment must state the asymmetry exactly as you propose —
   platform edits propagate in seconds, tenant edits do not propagate at all —
   because for the interval between CD-03a and CD-03c that is live, surprising,
   and invisible from the code otherwise.
2. **Unique index on `custom_domain` — DEFER to CD-03b, as recommended.**
   Application-level enforcement here is sufficient while one operator edits one
   client at a time. CD-03b writes a migration anyway.
3. **`robots.txt` — no change, as recommended.** Matching `/`'s existing
   treatment is the consistent answer, and adding one without the other would be
   worse than adding neither.
4. **`.orderBy(clients.slug)` in `sitemapClients()` — INCLUDE, as recommended.**
   One line, no URL-set change, and this increment is precisely what makes
   `clients` writes routine — leaving it out means every future sitemap diff
   carries reshuffle noise. It also closes a CD-01 standing finding that has
   already cost two increments' evidence extra sorting.
5. **Audit trail — DEFER, and I am ruling explicitly rather than leaving it
   silent, which is what you asked for.** With one env-based operator the "who"
   is known; the "what" and "when" are not, and `clients` has no `updated_at` at
   all. CD-03b writes a migration and creates rows, so it carries **at minimum
   `clients.updated_at`**. A full audit log is a product decision I am raising
   with the user rather than deciding here.
6. **`latitude`/`longitude` stay `varchar(32)` with application validation — as
   recommended.** The house `real` rule is right in principle, but changing it is
   a migration and would drift this increment into CD-03b. Revisit when a
   migration is already open.
7. **Server-side acknowledgement for the second vastu tenant — APPROVED, the
   stricter reading stands.** You are following §11 as I corrected it during
   CD-02 ("any tenant beyond those that already have it") over the task's literal
   AC wording, and `lib/vastu/enabled.ts` says in terms that CD-03 must enforce
   this "as a hard cap in the Server Action rather than as advice next to a
   switch". A warning the action does not enforce is exactly what that comment
   rejects. AC 6 is satisfied a fortiori; do not weaken it to match the AC's
   letter.

### Rulings on Architecture Conflicts

- **1 (dead `revalidatePath`)** — accepted; the asymmetry comment is mandatory,
  not optional.
- **2 (listing reversal)** — accepted, and your sharper reasoning is the right
  one to record: the old justification was never sound, because `/` was always
  gated and obscurity protected nothing.
- **3 (`proxy.ts` changes)** — accepted. CD-01's byte-identical hash was that
  increment's acceptance criterion, not a standing invariant. The four lines are
  URL parsing with no database access, and the six-tenant status sweep is what
  proves no tenant URL regressed. The rejected `/?client=<slug>` alternative was
  correctly rejected.
- **4 (`lib/verticals/index.ts`, fourth prototype instance)** — accepted as a
  standing finding, **not fixed here**, and I verified it: `isVerticalId`
  returns true for `constructor`/`toString`/`__proto__`, and `proxy.ts` calls it
  on every request. Adding a fifth shared-path file to the first writing
  increment is the wrong trade. It goes to `current-status.md` with the
  per-request call site named.
- **5 (`getPropertyImagesFor` untaggable)** — accepted; nothing here writes
  property images, and the note is what a future author needs.
- **6 (platform read side unscoped)** — accepted **on the stated conditions**:
  confined to `lib/platform/clients.ts`, the exception documented in that file's
  header, both call sites gated, and proven by grep that nothing under
  `app/site/[tenant]/` imports it. That grep is a blocking evidence item, not a
  nicety — it is the only thing standing between this module and a tenant page
  reading another client's row.

### Conditions

- **Sequence step 7's intermediate build is mandatory.** Everything before it is
  on every tenant's path with no UI depending on it, so a failure there is
  unambiguous. Per-tenant counts must already match `prerendered-before.txt`.
- **`urban-flat-real-estate` is the guinea pig. `high-properties` is never
  mutated.** The fourth-tenant vastu refusal is proved by the pure `vastuDecision`
  probe — never by enabling the flag.
- Evidence 16 (restore the guinea pig) runs **before** the increment is declared
  done, and the final six-row `select` proves it.

PENDING
