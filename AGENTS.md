<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Gigzman Client Sites

One Next.js 16 codebase serving several real client websites from a single
deployment. Each client is a **tenant**: its own content, brand and — where it
has one — its own domain. Six tenants live under `clients/`, across two
verticals (`realestate`, `cafirm`).

These are **live sites for real businesses**. Content correctness is a delivery
requirement here, not a nicety — see *Never invent client facts* below.

## Verification: there is no test suite

`package.json` has **no `test`, `lint` or `typecheck` script**. Do not claim
tests pass, and do not invent a command. What actually exists:

| Command | What it verifies |
|---|---|
| `pnpm build` | Typechecks and compiles every route. **This is the typecheck.** |
| `pnpm check:content <slug>` | Placeholder / pending / duplicate-content checklist before delivery |
| `pnpm dry-run [baseUrl]` | Playwright sweep of every page at three viewports. ⚠️ Currently **stale** — references removed templates (`temp-luxury-showcase`, `temp-advisory`, …) and will fail until updated |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations |
| `pnpm seed:client <slug> [--force]` | Load a client's YAML into the database. `--force` refuses when the database is newer than the YAML — a dashboard edit would be overwritten — unless `--overwrite-dashboard-edits` is also passed |
| `pnpm export:client <slug>` | The reverse: regenerate `clients/<slug>/` from the database, so the checked-in file says what the live site says. Preserves `_status` and the file header; inline body comments are lost, so read the diff |

`playwright` is a devDependency for `dry-run` only. Its browser binaries may not
be installed (`npx playwright install chromium`).

## Request lifecycle — read this before touching routing

```
/realestate/temp-premium-v2/high-properties/properties
        │
        ▼  proxy.ts   (Next 16 renamed middleware.ts → proxy.ts; runs on Node)
   splits {vertical}/{template}/{slug}, sets x-tenant* headers,
   rewrites to →  /site/high-properties/properties
        │
        ▼  app/site/[tenant]/(public)/properties/page.tsx
        │
        ▼  lib/tenant.ts   resolves slug → clients row, and RE-VERIFIES that the
                           URL's vertical and template really belong to it
        │
        ▼  lib/content.ts  every query scoped by clientId
```

The URL you see never matches the folder path. That is deliberate: `/` stays
free for the gated internal dashboard.

`proxy.ts` has **no database access** — it only checks that segments are
*known*. Whether they are correct *for that client* is asserted in
`lib/tenant.ts`.

## Non-negotiables

**1. Every query is scoped by `clientId`.** One tenant must never read or write
another's rows. Server Actions are reachable POST endpoints — the dashboard
layout having rendered proves nothing about the caller. Follow the existing
guard in `lib/actions/dashboard-actions.ts`:

```ts
await assertOwnership(row, clientId);   // throws if row.clientId !== clientId
```

**2. Public pages must not call `headers()`.** Any page that does is forced into
dynamic rendering, Next sends `no-store`, and every request re-renders on the
server.

```ts
getTenantBySlug(params.tenant)   // ✅ public pages — stays prerenderable
getTenant()                      // ✅ dashboard + server actions only (reads headers)
```

**3. Never invent client facts.** Addresses, phone numbers, hours, founding
years, team members, testimonials and registration numbers must come from a
real source or stay empty. Every YAML field carries `_status`:

- `verified` — confirmed from a named source (the file header says which)
- `placeholder` — demo content, must be replaced before delivery
- `pending` — unknown; renders nothing

An empty field renders nothing. An invented field ships a lie on a real
business's website. Prefer empty.

**4. Regulatory constraints are encoded in the schema — respect them.**

- **RERA**: a property listing without `reraNumber` must show a visible
  "registration pending" state (see `PropertyCard`), never silently omit it.
  Indian law requires the registration on any advertisement for a registered
  project.
- **ICAI**: `reviewsEnabled` defaults to `false` because the Code of Ethics
  prohibits testimonials, star ratings and endorsements on a CA firm's own site.
  Do not flip it on for a `cafirm` tenant.

**5. Two caching layers, and they do different jobs** (`lib/content.ts`):

- React `cache()` — dedupes within one request
- `unstable_cache()` — persists across requests, 300s

The second one is not optional polish: functions run in `bom1` (Mumbai) while
the database pooler is in `ap-southeast-2`, so every uncached query pays a
cross-region round trip. When adding a cached function, **key parts must
include every argument that changes the result.**

## Two separate auth systems

| | Platform login | Tenant dashboard login |
|---|---|---|
| URL | `/login` → gates `/` | `…/{slug}/dashboard/login` |
| Source | `.env.local` env vars | `users` table |
| Touches DB? | **No** | Yes |
| File | `lib/platform-auth.ts` | `lib/auth.ts` |
| Cookie | `gz_platform_session`, 1h | `gz_session`, 8h |

There is no longer a separate `/admin` section — `/` itself is the single gated
dashboard, and it lists every client for the signed-in team member; access is controlled by the platform login rather than by slug obscurity.

### `.env.local` trap: bcrypt hashes must be escaped — in the file only

dotenv performs `$VARIABLE` expansion, and a bcrypt hash is literally
`$2b$10$…`. Pasted raw, it is silently mangled before the app sees it and every
login fails with "Incorrect email or password". Quotes do **not** help — dotenv
strips them, then expands. Escape every `$`:

```bash
PLATFORM_ADMIN_PASSWORD_HASH=\$2b\$10\$KlkzN7…
```

**The escaping is local-only, and a real deployment needs the opposite.** It
is undone by `@next/env`'s `_resolveEscapeSequences`, which rewrites
`\$` back to `$` — and that runs *only* on keys parsed out of a `.env`
**file**. `.env.local` is gitignored, so no such file exists in the
deployment: Vercel injects env vars straight into `process.env` and nothing
unescapes them. Paste the escaped form into the Vercel dashboard and
`bcrypt.compare` receives the backslashes verbatim, reads them as an invalid
salt and returns `false` — so the login fails with the *same* "Incorrect
email or password" as the mangled-locally case, from a hash that verifies
fine on your machine. Nothing in the log says which of the two it was.

So the same secret is written two different ways, and both are correct:

| Where | Form |
|---|---|
| `.env.local`, or any `.env` file | `\$2b\$10\$…` — escaped, or dotenv eats the `$` |
| Vercel, or any real environment variable | `$2b$10$…` — bare, or bcrypt reads an invalid salt |

Editing it on Vercel needs a **redeploy**: an env var change does not reach a
deployment that already exists.

## Adding a tenant

Four steps. Since CD-01 none of them edits application code — the template
assignment is data on the `clients` row — but they all still happen in the
repo, so a client cannot be onboarded from the dashboard today:

1. `clients/<slug>/` with `profile.yaml` + `content/*.yaml`
2. In that `profile.yaml`, `template: premium-v2` for a real-estate tenant.
   `pnpm seed:client` writes it to `clients.template_key`, which is what
   `lib/tenant.ts` resolves against — a `realestate` row whose value is null or
   not in `TEMPLATE_REGISTRY` **404s**. A `cafirm` tenant has no template and
   the key is omitted.
3. Logo at `public/verticals/realestate/templates/premium-v2/brand/<slug>-logo.png`
4. `pnpm seed:client <slug>` (also creates the dashboard admin user and prints
   its password **once**)

Custom domain additionally needs `lib/domains.ts` → `HOST_TENANT_MAP` on a
host-mode deployment. That map and `clients.customDomain` answer different
questions and neither is a copy of the other — the comment in `lib/domains.ts`
says which is which.

**Per-client feature toggles live on the `clients` row**, in the
`features jsonb not null default '{}'` column — they were `Set`s of slugs in
code until CD-02. Which features *exist* is still code; which features a client
*has* is data.

| Toggle | `clients.features` key | Default when absent |
|---|---|---|
| Property map section | `propertyMap` | **true** (opt-out) |
| Property-management section | `propertyManagementSection` | false |
| Property-management page | `propertyManagementPage` | false |
| Vastu sectors | `vastuSectors` | false |
| Home-loan pages | `homeLoan` | false |

Read them only through `featureEnabled(row, key)` in `lib/features.ts` — jsonb
has no type checking, so a hand-written `"yes"`, `1` or `null` must not reach a
boolean gate — or, in practice, through the named helpers that wrap it in
`lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts` and
`lib/home-loan/enabled.ts`, where each flag's domain reasoning lives. Those
helpers are **synchronous** and take the tenant row, not a slug, and both
properties must stay that way: they are called from `generateStaticParams`,
from `lib/sitemap.ts` and inline in JSX, so making one `async` breaks the
build. A `"use client"` consumer receives the resolved boolean as a prop
(`FooterV2`), never a lookup.

`{}` is well-defined, not unknown: it means every default above. Note the
defaults are not uniform — `propertyMap` is opt-**out**.

**Hero copy** (eyebrow, headline, blurb, four stat tiles) moved to
`clients.hero_copy` in CD-07. `DEFAULT` in `lib/premium-v2/positioning.ts`
stays as the fallback when the column is null, so a newly created client has a
working hero with no data entry. Stat *values* are only stored for
`kind: "claim"` — the others are counted from the client's own inventory at
render time so the figure cannot drift from what the site shows.

## Layout of the repo

| Path | What |
|---|---|
| `proxy.ts` | Tenant resolution from URL or hostname |
| `app/site/[tenant]/(public)/` | 39 public pages — every client site |
| `app/site/[tenant]/dashboard/` | 10 client dashboard pages |
| `app/login/`, `app/page.tsx` | Gated internal dashboard (team only) |
| `lib/tenant.ts` | Tenant resolution + `basePathFor` / `tenantPath` |
| `lib/content.ts` | All read-side data access, clientId-scoped |
| `lib/db/schema.ts` | 16 tables, all scoped by `clientId` |
| `lib/actions/` | Server Actions (dashboard CRUD, lead submission) |
| `lib/verticals/` | Per-industry config (`realestate`, `cafirm`) |
| `lib/premium-v2/` | Template copy + per-client switches |
| `components/realestate/premium-v2/` | The one surviving template's components |
| `clients/<slug>/` | Per-client YAML content (seed source) |
| `scripts/` | Seeding, content checks, image and import tooling |
| `source-data/` | Vendored inputs the content was built from |

## Conventions

- **Tailwind v4** via `@tailwindcss/postcss`. There is **no `tailwind.config.js`** —
  design tokens and per-vertical/per-template palettes live in `app/globals.css`
  (`[data-vertical]`, `[data-template]`). Colours are per-*template*, not
  per-client.
- Premium-V2 components are suffixed `V2` and compose the primitives in
  `components/realestate/premium-v2/gp-primitives.tsx` (`GpContainer`,
  `GpSection`, `GpEyebrow`, `cn`).
- Internal links are written as clean paths (`/properties`) and prefixed with
  `await tenantPath(...)` / `basePathFor(tenant)` — never hardcode the
  `/realestate/temp-premium-v2/<slug>` prefix. It is empty in host mode.
- `generateStaticParams` on a nested dynamic route must return the **complete**
  param set including the ancestor's `tenant`. Returning only the child's own
  param silently prerenders nothing. Use the helpers in `lib/static-params.ts`.
- Uploaded images go to `public/uploads/{clientId}/{propertyId}/` — never trust
  a client-supplied filename.
- Comments here explain *why*, not *what*. Match that density; several modules
  document a decision and its rejected alternative. Preserve those when editing.
