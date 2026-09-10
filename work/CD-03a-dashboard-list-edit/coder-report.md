# IMPLEMENTATION RESULT

CD-03a — Platform dashboard: client list and edit screens

## Work Item

Build the team-only client list at `/` and an edit screen for an existing client
at `/clients/[slug]` covering business details, custom domain, active state, the
five `firm_settings` section toggles and the five `clients.features` flags; add
the per-tenant cache tag that makes an edit visible on the public site without
waiting out the ~10-minute window; close the `lib/domains.ts` prototype-chain
finding and the `isActive`-does-not-stop-writes finding.

## Outcome

Implemented as approved. All 11 acceptance criteria PASS with observed evidence.
No migration. The six tenants' rendered output is byte-identical to the
pre-change baseline on every measurement taken: per-tenant prerendered counts,
per-family counts, a 82-path six-tenant status sweep, and all 11 sitemap URL
sets. The guinea pig (`urban-flat-real-estate`) is fully restored — all six
`clients` rows are byte-identical to the pre-change snapshot, and its
`firm_settings` row differs only in `updated_at`. `high-properties` was never
mutated and is byte-identical including `updated_at`.

**The headline (AC 2): an edit made through the Server Action appeared on the
tenant's prerendered public home page 1 second later**, against a ~600-second
uncached window. Turning a feature off took its page family from 200 to 404 on
the very next request; deactivating the tenant took its home page to 404 on the
very next request.

## Affected Tenants

Rendered output: **none of the six changed.** Verified counts, before → after:

```
arora-k-associates        42 →   42
evergreen-real-estate    546 →  546
expert-realtors          547 →  547
high-properties         5005 → 5005
nayra-realtors          1071 → 1071
urban-flat-real-estate  1071 → 1071
```

`diff prerendered-before.txt prerendered-after.txt` → no output. The fresh
baseline matched the CD-02 hard gate exactly, so the primary regression signal
was trustworthy.

Per-family counts, before → after (`diff families-*.txt` → no output):

```
high-properties          home-loan=524   vastu-gurugram=3699  property-management=1
evergreen-real-estate    home-loan=0     vastu-gurugram=0     property-management=1
expert-realtors          home-loan=0     vastu-gurugram=0     property-management=1
nayra-realtors           home-loan=524   vastu-gurugram=0     property-management=1
urban-flat-real-estate   home-loan=524   vastu-gurugram=0     property-management=1
```

Guinea pig: `urban-flat-real-estate` for every mutation. `high-properties` never
mutated. `arora-k-associates` used only for a read-only guard test (ICAI), and
its row is unchanged including `updated_at`. **`vastuSectors` was never enabled
on a second tenant.**

## Implemented Components

- **Client list at `/`** — all six clients, columns slug / display name /
  vertical / template / active / custom domain / last updated, a live-site link
  and a client-dashboard link per row, a server-side `?q=` search, inactive rows
  muted, `ClientLookupForm` retained as the fast path, `noindex` kept.
- **Edit screen at `/clients/[slug]`** — three independently-saved panels
  (Identity & routing, Business details, Features), `slug`/`vertical`/`template`
  rendered read-only, per-panel "when this takes effect" notes, the stale-YAML
  notice, the ICAI lock on a `cafirm` tenant, and the two confirmation
  checkboxes.
- **Three Server Actions** with the mandatory `requirePlatformAdmin()` preamble,
  a database re-read of the posted `clientId`, and `unstable_rethrow(error)` as
  the first statement of every catch.
- **Per-tenant cache tags** (`tenant-slug:<slug>`, `tenant:<clientId>`) on
  `lookupClientBySlug` and on the four `clientId`-scoped cached reads, expired
  with `updateTag` from every platform save.
- **`isActive` closed on the four write paths** it did not cover.
- **`lib/domains.ts` `Object.hasOwn` fix.**
- **`sitemapClients()` `.orderBy(asc(clients.slug))`** (manager ruling 2).

## Files Created

| Path | Lines |
|---|---|
| `lib/cache-tags.ts` | 28 |
| `lib/platform/feature-copy.ts` | 202 |
| `lib/platform/clients.ts` | 104 |
| `lib/actions/platform-actions.ts` | 396 |
| `components/platform/form-primitives.tsx` | 216 |
| `components/platform/ClientIdentityForm.tsx` | 134 |
| `components/platform/BusinessDetailsForm.tsx` | 315 |
| `components/platform/FeatureToggles.tsx` | 163 |
| `app/clients/[slug]/page.tsx` | 208 |

Evidence tooling, also new, under `work/CD-03a-dashboard-list-edit/`:
`sql.mjs`, `mint-session.mjs`, `action-call.mjs`, `business-save.mjs`,
`lead-post.mjs`, `host-probe.ts`, `vastu-probe.ts`, `sweep.sh`, plus the
captured before/after artefacts.

## Files Modified

| Path | Change |
|---|---|
| `app/page.tsx` | client list + search + comment rewrite |
| `proxy.ts` | `clients` segment exemption + `/` comment rewrite |
| `lib/tenant.ts` | per-slug tagged `unstable_cache`; `isActive` on both `getTenant()` branches; `isActive` comment rewrite |
| `lib/content.ts` | `cachedForClient` + 4 call sites; `getPropertyImagesFor` comment; header rewrite incl. the mandatory asymmetry paragraph |
| `lib/auth.ts` | `isActive` predicate in `getSessionUser()` |
| `lib/actions/auth-actions.ts` | `isActive` predicate in `login()` |
| `lib/actions/submit-query.ts` | `isActive` predicate on both branches |
| `lib/domains.ts` | `Object.hasOwn` + comment |
| `lib/sitemap.ts` | `.orderBy(asc(clients.slug))` + comment (ruling 2) |
| `lib/platform-auth.ts` | header comment rewrite |
| `app/lookup-actions.ts` | comment rewrite |
| `lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`, `lib/home-loan/enabled.ts` | `CD-03` → concrete module names; reasoning paragraphs preserved |
| `AGENTS.md` | "renders **no client listing**" line replaced |

**Untouched and verified so:** `lib/db/schema.ts` and `drizzle/meta/_journal.json`
are byte-identical before and after
(`a4809aac7f9e…`, `93c44b08ed8d…` in both runs). Nothing under
`app/site/[tenant]/`, `components/realestate/**`, `components/dashboard/**`,
`clients/**`, `scripts/**`, `lib/static-params.ts`, `lib/features.ts`,
`lib/templates/index.ts`, `lib/verticals/**` or `package.json`.

`proxy.ts` moved from `fdfccc9` (CD-01's recorded hash) to `749a0a49…`. The full
`git diff proxy.ts` is exactly the four-line exemption plus the rewritten `/`
comment — no database access added.

## Database Migrations

**None.** No new column, index or constraint. `git status --porcelain drizzle
lib/db/schema.ts` lists only entries already present in `pre-state.txt`
(lines 48, 64–67), i.e. CD-01/CD-02's uncommitted work.

## Data Access / Server Actions Added or Changed

**`lib/platform/clients.ts` (new, deliberately unscoped, gated by its callers):**
- `listClientsForPlatform()` — `leftJoin` on `firm_settings`, `ORDER BY slug`,
  **no try/catch** (with the reason in a comment: a swallow would render an empty
  table that reads as "no clients" when it means "database unreachable").
- `getClientForPlatform(slug)` — row + settings row.
- `vastuSectorTenants()` — all rows, filtered in JS through `vastuSectorsEnabled`
  rather than a SQL predicate on the jsonb.

**`lib/actions/platform-actions.ts` (new):** `updateClientIdentity`,
`updateClientBusinessDetails`, `updateClientFeatures`. Guards implemented exactly
as specified (I1–I5, B1–B3, F1–F3). `slug` and `vertical` appear in no `.set()`.
`features` is rebuilt from the five known keys. `social_links` is merged;
`opening_hours` is fully replaced in fixed Monday–Sunday order. Coordinates
validated as both-or-neither finite decimals in range. A missing `firm_settings`
row is refused, never inserted.

**`lib/content.ts`:** `cachedForClient(keyPart, clientId, fn)` added beside the
existing `cached()`; applied to `getFirmSettings`, `getTeam`, `getCalculators`,
`getLocalities`. `getPropertyImagesFor` keeps `cached()` and gained the comment
saying why it cannot carry a tenant tag.

**`lib/tenant.ts`:** `lookupClientBySlug` is now a per-call wrapper with
`["client-by-slug", slug]` key parts and `tags: [tenantSlugTag(slug)]`.
`revalidate: 300` unchanged.

**`isActive` predicate added to** `getTenant()` (slug branch as a guard, host
branch inside the `where`), `getSessionUser()`, `login()`, and both branches of
`submitQuery()`.

## Routes Added or Changed

| Route | File | Mode in the build output |
|---|---|---|
| `/` | `app/page.tsx` | `ƒ` (force-dynamic) — modified |
| `/clients/[slug]` | `app/clients/[slug]/page.tsx` | `ƒ` (force-dynamic) — new |
| everything under `app/site/[tenant]/**` | — | unchanged, `●` SSG, `5m` revalidate |

`generateStaticParams` unchanged everywhere; neither new route is under
`[tenant]`, so the ancestor-`tenant` rule does not apply to them.

## Rendering and Caching

| Cache | Key parts | Tag | Invalidated by |
|---|---|---|---|
| `lookupClientBySlug` | `["client-by-slug", slug]` | `tenant-slug:<slug>` | all three platform actions |
| `getFirmSettings` | `["firm-settings", clientId]` | `tenant:<clientId>` | all three |
| `getTeam` | `["team", clientId]` | `tenant:<clientId>` | all three |
| `getCalculators` | `["calculators", clientId]` | `tenant:<clientId>` | all three |
| `getLocalities` | `["localities", clientId]` | `tenant:<clientId>` | all three |
| `getPropertyImagesFor` | `["property-images-batch"]` + args | none | nothing (unchanged) |
| ISR entries for `(public)/**` | route | inherits both tags via the layout | all three, transitively |
| `/sitemap.xml`, `/sitemaps/<family>.xml` | route, `revalidate = 3600` | pathname tag | `revalidatePath` literals from identity + features |
| `/`, `/clients/[slug]` | `force-dynamic` | — | nothing needed |

Every key part contains every argument that changes the result. The
tags-fixed-at-wrap-time trap is handled by building each cache per call with the
varying value in `keyParts` — the reason is written out in both files.

`updateTag` is used, never `revalidateTag`. `revalidatePath` is used only for the
two literal sitemap pathname forms that actually match, from
`updateClientIdentity` and `updateClientFeatures`; `updateClientBusinessDetails`
does not call it, because no `firm_settings` field appears in a sitemap URL. No
`revalidatePath` for `/` or `/clients/[slug]` — both are `force-dynamic`; the
forms call `router.refresh()`.

## Per-Client Gating

Nothing in this increment is gated per client. The five per-client gates it
*edits* stayed exactly where CD-02 put them — `clients.features`, read only
through `featureEnabled()`, with the reasoning in the three gate modules (whose
paragraphs are preserved; only the `CD-03` forward references became concrete
module names). No gate moved, no accessor changed signature, none became async.
The feature flags were **not** added to the tenant dashboard's `SettingsForm`,
per the CD-02 ruling; `components/dashboard/**` is untouched.

## Content / YAML Changes

**None.** No file under `clients/` was created, edited or deleted; no field's
`_status` changed. `git status --porcelain clients/` shows only entries already
in `pre-state.txt`.

`pnpm check:content high-properties` → `PENDING 3` (firm_registration_number,
search_console_verification, notification_email), `PLACEHOLDER 3` (legal.yaml,
localities.yaml, updates.yaml) — identical to `current-status.md`.
`pnpm check:content arora-k-associates` → `11 placeholder · 9 pending` —
identical to `current-status.md`.

The UI honours the content rules: every input's `defaultValue` is the stored
value or `""` (hints live in a separate `help` slot, never inside a value); the
registration label comes from
`getVerticalConfig(vertical).footer.registrationLabel` and rendered as
**"RERA Regn."** on `urban-flat-real-estate` and **"ICAI FRN"** on
`arora-k-associates`; the form offers no way to generate or default it.

## Commands Executed

```
pnpm build                          x3  (baseline, mandatory intermediate, final) — all exit 0
pnpm exec next start -p 3456            (production server for all HTTP evidence)
pnpm check:content high-properties
pnpm check:content arora-k-associates
npx tsx work/.../host-probe.ts          (AC 9, pre-fix and post-fix, two env settings each)
npx tsx work/.../vastu-probe.ts         (AC 6 cap branch, pure function)
node work/.../action-call.mjs           (direct Server Action POSTs, authenticated and not)
node work/.../business-save.mjs         (business panel round trips)
node work/.../lead-post.mjs             (AC 8 lead-form action POST)
node work/.../sql.mjs                   (SQL snapshots; psql is not installed on this machine)
sh   work/.../sweep.sh {before,after,final}
git status --porcelain | sort > post-state.txt ; diff against pre-state.txt
sha256sum proxy.ts lib/db/schema.ts drizzle/meta/_journal.json   (before and after)
```

`pnpm dry-run` was **not** run — it is stale. No `test`, `lint` or `typecheck`
script exists and none was invented.

## Results

**There is no test suite in this repository, so nothing here is a test result.**
`package.json` defines no `test`, `lint` or `typecheck` script. `pnpm build` is
the typecheck; everything else below is observed behaviour against a real
`pnpm start` server and real SQL.

- **Builds:** three, all exit 0, TypeScript clean each time. The mandatory
  step-7 intermediate build (shared-module changes only, no UI yet) already
  matched `prerendered-before.txt` exactly.
- **One build failure and its cause, recorded honestly.** The first intermediate
  attempt died at `2414/9659` with `Next.js build worker exited with code:
  3221226505` (Windows `0xC0000409`). Not Postgres `53300` and not `53200` —
  a Node worker abort under memory pressure, with 4.9 GB free and 11 node
  processes alive. Freeing the server process I had started and retrying gave a
  clean build. Recorded as the machine-memory hazard the plan anticipates, not a
  code defect: the retry and both later builds were green with identical counts.
- **Regression:** status sweep of 82 paths across the six tenants identical
  before and after (`diff` → no output), and identical again in a third `final`
  sweep taken after every mutation had been restored. All 11 sitemap URL sets
  identical, sorted (120 / 1300 / 308 / 56 / 18 / 20 / 375 / 1572 / 910 / 1220 /
  3699 URLs).
- **AC 2 timing:** phone changed through `updateClientBusinessDetails`; the new
  value appeared on the prerendered tenant home page on the **first poll,
  +1 second**. Restoring it took the original value back, also at **+1 second**.
- **Auth:** unauthenticated direct POST to all three actions returned
  `X-ACTION-REDIRECT: /login?next=%2F;push` — the redirect from
  `requirePlatformAdmin`, correctly rethrown past the catch, with no
  `NEXT_REDIRECT` string leaking into an `ActionResult`. `clients` and
  `firm_settings` were byte-identical afterwards including `updated_at`.
- **Guinea pig restored:** all six `clients` rows byte-identical to
  `clients-before.txt`; `firm_settings` for `urban-flat-real-estate` differs only
  in `updated_at`; `high-properties` byte-identical including `updated_at`; the
  one `queries` row created as an AC 8 control was deleted (count back to 0), and
  the `twitter` social probe key was removed.

## Pre-Flight Self-Review

1. **Tenant scoping.** PASS with one deliberate, confined exception. Every
   `lib/content.ts` query keeps its `clientId` parameter and its `where`; the
   change there is additive. Every platform write targets exactly one row by
   `eq(clients.id, row.id)` / `eq(firmSettings.clientId, row.id)`, where `row`
   came from a database read keyed by the posted id — no bulk update, no `where`
   built from form input. The one unscoped read side is `lib/platform/clients.ts`,
   which says so in its header, is gated by `requirePlatformAdmin` at both call
   sites, and is proven unreachable from the tenant tree:
   `grep -rnE '^\s*import .*(lib/platform|platform-actions)' app/site
   components/realestate components/dashboard lib/content.ts lib/tenant.ts
   lib/sitemap.ts` → **no output** (blocking evidence item, per the manager).
2. **Public pages stay static.** PASS. `grep -rn "headers()" "app/site/[tenant]/(public)"
   --include=*.tsx` excluding `loading.tsx` → no output. `getTenant()` has exactly
   two call sites outside `lib/tenant.ts` (`properties/loading.tsx`,
   `dashboard/login/page.tsx`), unchanged in number. Both new routes are outside
   the tenant tree. Every `(public)` route still reports `●` with `5m` revalidate
   in the build output.
3. **`generateStaticParams` returns the complete param set.** PASS — unchanged
   everywhere; no route's param set was touched and `lib/static-params.ts` was not
   modified. Confirmed by observation rather than by the build's summary: the
   per-tenant prerendered HTML counts are identical (42/546/547/5005/1071/1071)
   and every `(public)` route still appears as `●` prerendered.
4. **Cache keys vary with every argument.** PASS. `["client-by-slug", slug]` and
   `[keyPart, clientId]`; both wrappers are built per call precisely because the
   inner closure takes no arguments and stringifies identically for every tenant.
   Traced against each parameter and written out in both comments. Observed
   consequence: enabling/disabling a feature and editing a field on
   `urban-flat-real-estate` changed only that tenant's pages; the other five
   tenants' status codes and sitemap URLs were unchanged throughout.
5. **Links survive host mode.** PASS. No `/realestate/temp-premium-v2/<slug>`
   literal was written. Both screens build tenant links with
   `getTenantPath(row)`, the shared helper. (The platform dashboard itself is
   path-mode-only by construction — the `proxy.ts` exemption is in the path-mode
   branch, with the reason in the comment.)
6. **Blast radius across tenants.** PASS. No file under
   `components/realestate/premium-v2/` or `app/site/[tenant]/` was touched, so no
   shared template component changed. The seven shared modules that did change
   (`proxy.ts`, `lib/tenant.ts`, `lib/content.ts`, `lib/auth.ts`,
   `lib/actions/auth-actions.ts`, `lib/actions/submit-query.ts`, `lib/domains.ts`,
   plus `lib/sitemap.ts`) are on every tenant's path, which is why the six-tenant
   sweep was run three times and compared as a set.
7. **Config agrees with code.** PASS, and nothing was needed: no `next/image`
   `quality` value was introduced and no new disk-read asset was added, so
   `next.config.ts` is untouched.
8. **No invented client facts.** PASS. No YAML changed. The forms never prefill a
   value that is not in the row; example text lives in a `help` slot outside the
   input value; the registration label is resolved from the vertical config, and
   the field carries a note saying it comes from the client's own certificate and
   is never inferred. `reviewsEnabled` is disabled and unchecked on the `cafirm`
   tenant and refused server-side.
9. **Client-render purity.** PASS. `grep` for `Date.now()`, `new Date()` and
   `Math.random()` in `components/platform/**` → none. The four client components
   use only `useState`/`useTransition`/`useRouter` and event handlers; every
   resolved value (feature booleans, the live vastu slug list, the registration
   label, the template label) is computed in the Server Component and passed as a
   serialisable prop.
10. **Scope discipline.** PASS. `diff` of sorted `pre-state.txt` against
    `post-state.txt` adds exactly: `M app/page.tsx`, `M lib/actions/auth-actions.ts`,
    `M lib/actions/submit-query.ts`, `M lib/auth.ts`, `M lib/content.ts`,
    `M lib/platform-auth.ts`, `M proxy.ts`, `?? app/clients/`,
    `?? components/platform/`, `?? lib/actions/platform-actions.ts`,
    `?? lib/cache-tags.ts`, `?? lib/platform/`. Nothing else. `drizzle/` and
    `lib/db/schema.ts` are absent from the delta. (The other files I edited —
    `AGENTS.md`, `app/lookup-actions.ts`, `lib/tenant.ts`, `lib/domains.ts`,
    `lib/sitemap.ts` and the three gate modules — were already `M` in
    `pre-state.txt` from CD-01/CD-02, so they do not appear in the delta; their
    diffs are cumulative.)

## Acceptance Criteria

**AC 1 — `/` lists all six clients behind platform auth; still `noindex`;
unauthenticated redirects to `/login`. PASS.**
*Code:* `app/page.tsx` — `requirePlatformAdmin("/")` first statement,
`listClientsForPlatform()`, `metadata.robots` retained.
*Observed:* unauthenticated `GET /` → `307` → `http://localhost:3456/login?next=%2F`.
Authenticated `GET /` → `200`, `<meta name="robots" content="noindex, nofollow">`
present, and all six slugs rendered (8–9 occurrences each: row link, slug cell,
site link, dashboard link). `?q=nayra` → only `nayra-realtors` present, the other
five absent.

**AC 2 — a business-detail edit is visible on the public site without waiting out
the cache window. PASS — and this is the headline.**
*Code:* `getFirmSettings` carries `tenantDataTag(clientId)`; the public layout
calls it, so every `(public)` ISR entry inherits the tag;
`updateClientBusinessDetails` calls `updateTag(tenantSlugTag)` +
`updateTag(tenantDataTag)`.
*Observed:* `phone` `097114 41113` → `099999 00001` through the action
(`{"ok":true,"message":"Business details saved."}`); the tenant's prerendered
home page served the new value at **+1 s** (9 occurrences). Restored: original
value back at **+1 s** (14 occurrences). Independent second proof: turning
`homeLoan` off took `/home-loan` from `200` to `404` at **+0 s**; turning it back
on restored `200` at **+0 s**.

**AC 3 — `slug` and `vertical` cannot be changed after creation, proven by direct
POST. PASS.**
*Code:* neither field appears in any `.set()`; guards I1/I2 refuse a mismatch.
*Observed:* authenticated POST with `slug=urban-flat-renamed` + `vertical=cafirm`
→ `{"ok":false,"message":"The client ID cannot be changed after creation — it is
in every URL of this client's site. Create a new client instead."}`. POST with
only `vertical=cafirm` → `{"ok":false,"message":"A client's vertical cannot be
changed after creation."}`. `SELECT slug, vertical` afterwards →
`urban-flat-real-estate` / `realestate`, unchanged. No disabled input was offered
as evidence.

**AC 4 — every mutating action re-checks `requirePlatformAdmin()` and does not
trust a `clientId` from `FormData`. PASS.**
*Code:* identical preamble in all three actions; `loadClientRow()` re-reads the
row and every guard then reads `row.vertical` / `row.slug` / `row.features`.
*Observed:* unauthenticated direct POST to each of the three recovered action ids
(`40bdffb8…` identity, `405c43c1…` business, `407ce447…` features) →
`X-ACTION-REDIRECT: /login?next=%2F;push`, no `ActionResult` returned, and
`clients` + `firm_settings` byte-identical afterwards including `updated_at`.
Authenticated POST with `clientId=00000000-0000-0000-0000-000000000000` →
`{"ok":false,"message":"Client not found."}`.

**AC 5 — `reviewsEnabled` refused for a `cafirm` tenant by the action. PASS.**
*Code:* guard B2 on `row.vertical`, refusing the whole save.
*Observed:* authenticated POST to `arora-k-associates` with `reviewsEnabled=on` →
`{"ok":false,"message":"Reviews and ratings cannot be enabled for a
chartered-accountancy firm. ICAI's Code of Ethics prohibits testimonials, star
ratings and endorsements on a firm's own website."}`. `reviews_enabled` still
`false` and `updated_at` unchanged at `2026-09-10T07:19:29.325Z`, proving the
whole save was refused rather than partially applied. Rendered control:
`<input id="reviewsEnabled" type="checkbox" disabled="" …>` on the cafirm screen
versus enabled and `checked` on the real-estate one.

**AC 6 — a fourth `vastuSectors` tenant refused with the build-limit reason; a
second surfaces §11 with the current count. PASS (stricter reading, per manager
ruling 3).**
*Code:* `vastuDecision(enabledSlugs, acked)` in `lib/platform/feature-copy.ts`;
guard F1 fires on the enable transition and calls it with the live slug list from
`vastuSectorTenants()` minus this row.
*Observed, executed for real:* POST enabling `vastuSectors` on
`urban-flat-real-estate` without acknowledgement →
`{"ok":false,"message":"Enabling vastu sector pages here would make this the 2nd
tenant with them, adding about 3,700 prerendered routes to every build (currently
1 tenant: high-properties). docs/client-dashboard-brief.md §11 lists this as a
decision that needs a person. Tick the confirmation to proceed."}` — the count
came from the database, and `features` was unchanged afterwards.
*Observed, cap branch, pure probe with zero database writes:*
`vastuDecision(["a","b","c"], true)` → refused with *"Vastu sector pages are
capped at 3 tenants and 3 already have them (a, b, c). Each tenant adds about
3,700 prerendered routes; three is the most that has ever shipped, at a 32-minute
production build, and a fourth pushed the deployment past its output limit and
failed after 41 minutes. Turn it off for another tenant first."* — `acked`
notwithstanding. `vastuDecision([], false)` and `vastuDecision([], true)` → `ok`;
`vastuDecision(["high-properties"], true)` → `ok`. **`vastuSectors` was never
enabled on a second tenant.**
The cap and route cost have exactly one definition each
(`lib/platform/feature-copy.ts:56,59`); `platform-actions.ts` and
`FeatureToggles.tsx` contain no literal `3` or `3700` for either.

**AC 7 — `homeLoan` without the DSA confirmation refused. PASS.**
*Code:* guard F2, on the transition only.
*Observed, full round trip on the guinea pig:* (1) `features` recorded; (2) save
with `homeLoan` absent → `ok`, `/home-loan` `200` → `404` at +0 s; (3) save with
`homeLoan=on` and no confirmation → `{"ok":false,"message":"Home-loan pages state
that the firm is an authorised channel partner. Confirm that this client holds a
DSA relationship before enabling them."}`, `features` unchanged; (4) save with
`homeLoan=on` **and** `homeLoanDsaConfirmed=on` → `ok`, `/home-loan` `200` again
at +0 s; (5) `features` equals step 1 verbatim (`diff` → no output). Completed
before the final build.

**AC 8 — deactivating 404s the public pages and stops the Server Actions;
reactivating restores both. PASS.**
*Code:* `isActive` in `getTenantBySlug`, both `getTenant()` branches,
`getSessionUser()`, `login()`, and both `submitQuery()` branches; `updateTag` for
the rendered side.
*Observed:* **control first** — while active, an unauthenticated direct POST of
the lead-form action wrote a row (`{"ok":true,"reference":"Q-202609-XCWW3"}`,
`queries` count 0 → 1), so the probe is genuinely capable of writing. After
deactivation: home `404`, `/properties` `404`, `/dashboard/login` `404`, all at
+0 s; the same lead POST → `{"ok":false,"message":"This form is not available
right now."}` and the count stayed at 1; `sitemaps/core.xml` no longer contained
the slug (0 occurrences). After reactivation: home / `/properties` /
`/dashboard/login` / `/home-loan` all `200` at +0 s and the slug back in
`core.xml` (20 occurrences). The evidence lead row and its
`query_status_history` row were deleted; the guinea pig's `queries` count is back
to 0.
*Note:* `/properties` returned a hard `404` here, not the soft 404 the plan
expected. The standing soft-404 finding concerns a mismatched-vertical URL, not a
deactivated tenant; it is neither reproduced nor fixed by this increment.

**AC 9 — `tenantSlugForHost("constructor")` never returns a function. PASS.**
*Code:* `Object.hasOwn` guard plus an explicit fallback return.
*Observed, pre-fix* (`PRIMARY_TENANT_SLUG` unset): `constructor -> function`,
`Constructor:3000 -> function`, `__proto__ -> object {}` — a function and
`Object.prototype` returned from a signature promising `string | null`, and both
skipped the fallback. *Post-fix, unset:* every junk host → `null`;
`highproperties.in` and `www.highproperties.in` → `"high-properties"`.
*Post-fix, `PRIMARY_TENANT_SLUG=high-properties`:* every host →
`"high-properties"`. Never a function in any run.

**AC 10 — the six tenants render identically to baseline. PASS.**
*Observed:* per-tenant prerendered counts identical; per-family counts identical;
82-path status sweep identical (twice: immediately after the build, and again
after every mutation was restored); all 11 sitemap URL sets identical when
compared sorted.

**AC 11 — `app/page.tsx`'s "no client listing" comment rewritten. PASS.**
The plan's verbatim replacement is in place at `app/page.tsx:17-30`, stating that
the old reasoning was never sound because `/` was always gated. See *Deviations*
for the one grep in the plan that this verbatim text cannot satisfy.

## Architecture Plan Compliance

Implemented in the plan's 16-step sequence, including the mandatory step-7
intermediate build. Every named finding, ruling and conflict resolution was
applied:

- Finding 1 — no new `revalidatePath("/site")`-style call was written; the two
  literal sitemap forms are the only `revalidatePath` uses.
- Finding 2 — `updateTag` used; `revalidateTag(` appears nowhere as a call.
- Finding 3 — relied on and verified: the ISR entries inherit the tags, which is
  what makes AC 2 and AC 8 observable in ~1 second.
- Facts 1–12 — all honoured, including the `keyParts` trap, the four taggable
  functions, `getPropertyImagesFor`'s exemption, the four-file `isActive` closure,
  the `proxy.ts` exemption, the application-level domain uniqueness, the
  `firm_settings.updated_at` join for "last updated", the sorted sitemap
  comparison, the four rendered social keys, and the jsonb merge.
- Manager ruling 1 — `dashboard-actions.ts` untouched; the mandatory asymmetry
  paragraph is in `lib/content.ts` and names CD-03c explicitly.
- Manager ruling 2 — `.orderBy(asc(clients.slug))` added to `sitemapClients()`.
- Manager ruling 3 — the stricter reading implemented: acknowledgement required
  for **any** new vastu tenant, not only the fourth.
- Manager ruling 4 — no migration, no index, no `robots.txt` change, no audit
  table, no lat/long type change.
- Conflict 6 — the isolation grep is recorded above as a blocking item and
  returns no output.
- Conditions — guinea pig only, `high-properties` never mutated, vastu never
  enabled on a second tenant, restore verified before completion.

## Deviations

1. **Two shared constants live in `lib/platform/feature-copy.ts` that the plan
   did not name there:** `OPENING_DAYS` (the seven day rows, in order) and
   `MANAGED_SOCIAL_KEYS` (the four keys `FooterV2` renders). All three consumers
   need them — the Server Component builds the grid, the Client Component renders
   it, the Server Action reads it back — and none may import the other two. The
   alternatives were a third file in `lib/platform/` (which the plan's file list
   also does not have) or three copies of the same list, where a divergence would
   silently reorder a client's week or drop a social key. I extended that module's
   header to say it holds the platform screens' shared, import-free copy and
   constants. No behaviour differs from the plan.
2. **Two of the plan's Evidence-21 greps cannot return empty, because the plan's
   own mandated verbatim text contains the phrase they search for.**
   `grep -rn "no client listing" app` matches `app/page.tsx:21`, which is inside
   the required sentence *"This file used to say it 'deliberately shows no client
   listing'"*; `grep -rn "/admin" lib/platform-auth.ts` matches line 9, inside the
   required sentence *"There is no `/admin` section"*. I kept the verbatim text —
   it was specified word for word and it is the more useful artefact — and record
   the grep expectation as unsatisfiable rather than quietly editing the mandated
   comment. The other two greps in that group (`lib/content.ts`'s falsified
   staleness sentence, `lib/tenant.ts`'s "CD-03 owns closing it") return no output
   as required.
3. **Evidence was gathered on port 3456, not 3000.** An unrelated `next dev`
   process (started before this session, PID 31320) holds `:3000` and could not be
   stopped — `Stop-Process` on it was refused by this environment's command
   classifier — and `:3001` is held by another unrelated service. Every recorded
   URL is a path plus a status code, and sitemap `<loc>` values derive from
   `NEXT_PUBLIC_SITE_URL` (unset → `http://localhost:3000`) rather than the
   serving port, so no comparison is affected. That same stale process is why
   `rm -rf .next` fails on `.next/dev`; builds instead cleared everything under
   `.next` except that directory.
4. **`psql` is not installed on this machine.** SQL evidence was run through
   `work/CD-03a-dashboard-list-edit/sql.mjs`, which uses the same `postgres`
   driver and the same `DATABASE_URL` as the application.
5. **The plan's expected per-family shape for `property-management` was
   inaccurate at baseline**, and I did not "fix" it: `property-management.html`
   exists for all five real-estate tenants, not only `high-properties`, because
   the route prerenders its not-found body when the feature is off. The four
   gated tenants correctly return `404` at request time. The figure is identical
   before and after, which is what the check is for.

## Known Limitations

- **Tenant-dashboard edits still do not propagate.** Every `revalidatePath` in
  `lib/actions/dashboard-actions.ts` is a no-op, so from now until CD-03c the two
  write surfaces behave differently: a platform edit is live in about a second, a
  tenant edit waits out the 300-second window while the UI says "Settings saved."
  Stated in `lib/content.ts`'s header rather than left to be rediscovered.
- **No audit trail.** Nothing records what changed or when. `clients` has no
  `updatedAt`; the only trace of a platform edit is `firm_settings.updated_at`,
  and the identity and features panels write to `clients`, which has none.
  Deferred by manager ruling 5; CD-03b carries at least `clients.updated_at`.
- **No optimistic locking.** Two operators editing the same client at once: last
  write wins. Accepted — one operator, §12.
- **`clients.custom_domain` uniqueness is application-level only.** Enforced in
  `updateClientIdentity`; a concurrent pair of saves could still land two rows on
  one domain. The partial unique index is deferred to CD-03b.
- **`latitude`/`longitude` remain `varchar(32)`** with application validation
  instead of a `real` column.
- **`getPropertyImagesFor` cannot carry a tenant tag** — it is keyed by property
  ids and never sees a `clientId`. Harmless today (nothing here writes property
  images), noted in place for whoever adds that write path.
- **The escalation this increment creates, stated plainly.** Before it, a stolen
  `gz_platform_session` cookie could read a slug back and open a site. After it,
  that cookie can rewrite every client's business details and switch their sites
  off. The mitigations that exist are the 1-hour expiry, `httpOnly`,
  `sameSite: lax` and `secure` in production. There is no second factor and no
  audit record.
- **Empty string versus NULL.** The action follows the house idiom
  `String(...).trim() || null`, so a stored `""` becomes `NULL` on the first save
  through this form (observed on `urban-flat-real-estate.tagline`, and restored).
  Both render nothing; the same normalisation already happens in the tenant
  dashboard's `updateFirmSettings`. Worth knowing before diffing a row after an
  operator's first save.
- **A `next dev` process from before this session is running against this
  working tree** and will recompile on file changes. It did not affect any
  measurement (every build produced identical counts), but the next agent should
  expect `.next/dev` to be locked.

## Blockers

None.
