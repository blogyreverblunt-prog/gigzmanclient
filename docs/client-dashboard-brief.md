# Client Dashboard — Agent Brief

**Goal:** a non-technical team member can onboard a new client site end-to-end from
one gated screen, with zero code edits and zero terminal commands.

Today that is impossible: onboarding a client requires editing 3–5 source files and
running `pnpm seed:client`. This brief takes it to "fill a form, press Create".

---

## 0. How to run this

This document is the **design rationale**: why each change is shaped the way it
is, and what will break if it is shaped differently. It is not the work order.

The work is split into nine increments, each with a complete task definition under
`work/CD-0N-*/task.md`, and each run through the
`agent-manager` → `gigzman-architect` → `gigzman-coder` → `gigzman-verifier`
pipeline. The run order and the paste-ready kickoff prompts are in
[`docs/client-dashboard-prompts.md`](./client-dashboard-prompts.md).

| Phase below | Work item |
|---|---|
| §2 — 0A, 0B, 0D | `CD-01-tenant-registry` |
| §2 — 0C | `CD-02-feature-flags` |
| §3 | `CD-03-platform-dashboard` |
| §10 | `CD-09-yaml-db-truth` |
| §4 | `CD-04-gbp-autofill` |
| §5 | `CD-05-brand-assets` |
| §6 | `CD-06-seo-readiness` |
| §7 | `CD-07-hero-copy` |
| §8 | `CD-08-content-screens` |

**One work item at a time**, in the order given in the prompts document. CD-01 is
a hard prerequisite for everything; CD-03 gates the rest. Every increment ends
with `pnpm build` green and a `VERIFY_PASS`.

Agents read this document for the *why*; they take their scope, acceptance
criteria and evidence requirements from their own `task.md`. Where the two appear
to disagree, `task.md` is the instruction and this document is the explanation —
raise the discrepancy rather than choosing.

---

## 1. Ground rules

`AGENTS.md` governs. It is not optional context — read it first. In particular:

- **There is no test suite.** `pnpm build` is the typecheck. Do not invent
  `pnpm test` / `pnpm lint`. Do not claim tests pass.
- **Every query scoped by `clientId`.** Server Actions are reachable POST
  endpoints; re-check auth and ownership inside every one.
- **Public pages must not call `headers()`** — that forces dynamic rendering on
  the whole route. Use `getTenantBySlug(params.tenant)`. `getTenant()` is
  dashboard/actions only.
- **Never invent client facts.** Empty beats invented. The `_status`
  (`verified` / `placeholder` / `pending`) discipline applies to anything the
  dashboard writes, including anything autofilled from Google.
- **Regulatory constraints are load-bearing.** RERA registration state must stay
  visible on listings; ICAI forbids testimonials, ratings, fees and client logos
  on a `cafirm` tenant — `reviewsEnabled` stays `false` there.
- **Comments explain *why*.** Several modules document a decision *and its
  rejected alternative*. This brief overturns some of those decisions. When you
  overturn one, **rewrite the comment to record the new reasoning** — do not
  delete it, and do not leave it contradicting the code.

Dashboard-specific rules:

- **The dashboard is team-only.** It lives at `/`, behind the existing
  `PLATFORM_ADMIN_*` env auth (`lib/platform-auth.ts`). Do not build a second
  auth system, do not add client-facing access, keep `robots: noindex`.
- **Every screen must survive a non-technical user.** No raw JSON textareas, no
  slugs the user must invent unaided, no field whose failure mode is a broken
  build. Validate at the edge and explain errors in plain words.
- **After Phase 1 the database is the source of truth** for everything the
  dashboard edits. See §10.

---

## 2. Phase 0 — the three blockers

### 0A. Template assignment → `clients.templateKey`

**Now:** `lib/templates/index.ts:38` — `CLIENT_SLUG_TEMPLATE_MAP`, a hardcoded
slug→template object. A client absent from it is not merely untemplated: it
**404s**. `lib/tenant.ts` `getTenantBySlug()` returns `null` when a `realestate`
row has no entry there. A client created in the dashboard today would be invisible.

**Do:**

1. Add `clients.template_key varchar(60)` (nullable — `cafirm` tenants have no
   template). Generate the migration with `pnpm db:generate`; do not hand-write
   SQL.
2. Backfill the five current slugs to `premium-v2` in the migration.
3. Keep `TEMPLATE_REGISTRY` in code — it is the catalogue of templates that
   *exist* (`urlSlug`, label), and `proxy.ts` needs `isTemplateUrlSlug()` to stay
   synchronous and DB-free. Only the **client→template assignment** moves.
4. Replace `getTemplateKeyForSlug(slug)` with a row-based read. **Keep it
   synchronous** — every call site already has the tenant row in hand.

**Blast radius — audit all of these:**

- ~20 page files call `getTemplateKeyForSlug(tenant.slug) !== "premium-v2"` as a
  `notFound()` gate (area-converter, builders, calculators, contact, faq,
  firm-profile, …). These become `tenant.templateKey !== "premium-v2"`.
- `getTenantPath(vertical, clientSlug)` and `basePathFor(tenant)` are
  **synchronous** and build every internal link. They must take the row (or the
  template key), never do a lookup.
- `app/lookup-actions.ts:28` redirects using `getTenantPath`.
- `getTenantBySlug`'s guard: a `realestate` row with a null `templateKey` must
  still 404 — that guard is correct, keep it, just source it from the row.

`pnpm build` will find every call site. Use it as the checklist.

### 0B. Custom domain → stop treating this as a blocker

**Now:** `lib/domains.ts:17` — `HOST_TENANT_MAP`, hostname→slug.

**Read this before touching it:** a host-mode deployment (`TENANT_MODE=host`)
serves **exactly one client**, and `PRIMARY_HOST_TENANT`
(`process.env.PRIMARY_TENANT_SLUG`) is already the fallback for any unmapped
hostname. So the map is near-redundant, and this is *not* the blocker it looks
like. `clients.customDomain` **already exists** as a column and already feeds the
sitemap's absolute URLs.

**Do:**

1. Make `clients.customDomain` editable from the dashboard. That is the whole
   database side of this item.
2. Do **not** add a database read to `proxy.ts`. It runs on every request; the
   functions run in `bom1` and the pooler is in `ap-southeast-2`, so a lookup
   there taxes every single page view with a cross-region round trip.
3. Reduce `HOST_TENANT_MAP` to what it is — a per-deployment convenience — and
   update its comment: the source of truth is `clients.customDomain`, and a
   host-mode deployment needs `PRIMARY_TENANT_SLUG` set. Pointing DNS is a human
   step; surface it in the dashboard as an instruction, not as a form field that
   pretends to do it.
4. In the wizard, show the resolved live URL for the client (path mode) and, when
   a custom domain is set, the DNS records needed. Copy-to-clipboard.

### 0C. Feature flags → `clients.features` (jsonb)

**Now:** four files hold `Set<string>` allowlists —
`lib/premium-v2/home-sections.ts` (map section, property-management section,
property-management page), `lib/vastu/enabled.ts`, `lib/home-loan/enabled.ts`.

**The trap that dictates the design:** these helpers are called from
**synchronous** and **client-component** contexts:

- `components/realestate/premium-v2/FooterV2.tsx` is `"use client"` and calls
  `homeLoanEnabled(clientSlug)` during render.
- `components/realestate/templates/PremiumV2Home.tsx` calls two of them inline in
  JSX.
- `lib/premium-v2/tools.ts` and `lib/sitemap.ts` call them synchronously.
- Three route families call them inside `generateStaticParams()`.

**Making these helpers `async` will break the build.** Do not do it.

**Do instead:**

1. Add `clients.features jsonb not null default '{}'`, typed:

   ```ts
   type ClientFeatures = {
     propertyMap?: boolean;
     propertyManagementSection?: boolean;
     propertyManagementPage?: boolean;
     vastuSectors?: boolean;
     homeLoan?: boolean;
   };
   ```

2. Backfill from the current Sets in the migration — exactly, no "improvements".
3. Keep each helper's name and **synchronous** signature; change the parameter
   from `clientSlug: string` to the tenant row (or a `ClientFeatures` object).
   The row is already loaded and request-cached at every server call site.
4. For `FooterV2` and any other client component: the flag arrives as a **prop**
   from the server parent. No lookup crosses that boundary.
5. Preserve every existing comment's *reasoning* (the art is
   High-Properties-branded; the map is a non-functional placeholder; the DSA
   claim must be true) as helper text next to the toggle in the UI. Those reasons
   are why the toggle exists — a team member flipping it blind is the failure
   mode.

**Two hard constraints on the UI for these toggles:**

- **Vastu sectors is a deploy-risk toggle, not a preference.** It prerenders
  ~3,700 routes per tenant. At three tenants the production build took 32
  minutes; a fourth **blew the deployment output limit and failed the deploy
  after 41 minutes**. Enforce a **hard cap of three enabled tenants in the
  Server Action**, with that reason in the error message, plus a visible warning
  naming the current count and the routes each addition costs. Do not rely on
  the user reading a note.

  Exactly **one** tenant carries it today (`high-properties`), so the cap is not
  the only guard: enabling even a second is a §11 decision, because the
  32-minute figure was measured on a smaller site and the cost lands on every
  tenant added, not only on a particular ordinal. The Server Action refuses at
  four; a human decides at two and three.
- **Home loan asserts a DSA relationship.** The pages state the firm is an
  authorised channel partner. Gate the toggle behind an explicit confirmation
  checkbox: "Confirmed this client holds a DSA relationship with the lenders
  shown."

**Cache and build semantics — state these in the UI, do not hide them:**

- `lookupClientBySlug` is `unstable_cache(..., { revalidate: 300 })`. A toggle
  flip is invisible for up to 5 minutes unless the action revalidates. Add
  `revalidateTag`/`revalidatePath` on write and give the cache entry a tag.
- Pages already prerendered stay served from cache after a toggle goes **off**,
  and `generateStaticParams` only re-runs at build. Turning a page family off
  must revalidate its paths; full removal from the sitemap lands on the next
  deploy. Say so on screen: "Takes effect within ~5 minutes; sitemap updates on
  next publish."

### 0D. `isActive` is not actually enforced

Found while surveying: `clients.isActive` is checked in
`app/lookup-actions.ts:24` and in `activeTenants()` (so inactive tenants are not
prerendered), but **`getTenantBySlug()` never checks it** — an inactive client's
pages still render on demand. Before the dashboard exposes an Active switch, make
it mean something: 404 (or a holding page) for an inactive tenant, and exclude it
from the sitemap. Do this in Phase 0; a switch that does nothing is worse than no
switch.

---

## 3. Phase 1 — the dashboard itself

**Location:** extend `app/page.tsx`. It is already gated by
`requirePlatformAdmin()`, already `noindex`, and `proxy.ts` already lets `/`
through.

**A decision you are deliberately reversing:** `app/page.tsx`'s comment says it
"deliberately shows no client listing — a signed-in team member opens a specific
site by its ID, so nobody browsing this dashboard can discover a client they
don't already know the slug for." A client list is now a requirement. Reverse it
consciously and rewrite that comment: access is controlled by the platform login,
not by slug obscurity. Keep `ClientLookupForm` as the fast path.

**Screens:**

1. **Client list** — slug, display name, vertical, template, active, custom
   domain, live-site link, "Open dashboard" link, last updated. Search box.
   Inactive rows visibly muted.
2. **New client wizard** — one page, grouped sections, saves a draft as it goes.
   Fields per §9. Order: Identity → GBP autofill → Business details → Branding →
   Features → Review & create.
3. **Edit client** — the same form against an existing row.

**What "Create" must do, in one transaction where possible:**

- insert `clients` (slug, vertical, displayName, templateKey, customDomain,
  isActive, features)
- insert `firmSettings` with the vertical's defaults from
  `getVerticalConfig(vertical).defaults` — this is what keeps `reviewsEnabled`
  false for a CA firm
- seed the vertical's calculators from `lib/calculators/registry`
  (`calculatorKeys`) exactly as `seed:client` does
- create the tenant admin `users` row and **show the generated password once**,
  with a copy button and a "shown once" warning — mirror the seed script's
  behaviour, do not silently skip it
- revalidate the tenant caches
- redirect to the new client's edit screen with the live URL shown

**Slug rules:** lowercase, `^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$` — this is
`SLUG_PATTERN` in `proxy.ts`; import it, don't re-type it. Auto-suggest from the
business name, check uniqueness live, and warn in plain words that it is
permanent because it is in the URL.

**Do not** shell out to `pnpm seed:client` from a Server Action. The wizard does
the inserts itself; the seed script stays the bootstrap-from-YAML path.

---

## 4. Phase 2 — Google Business Profile autofill

**What the team member does:** pastes a Google Maps / GBP link, presses Fetch,
reviews a prefilled panel, ticks what is correct, saves.

**How to fetch it.** A pasted Maps URL is not queryable on its own, and the
Business Profile API needs OAuth as the *business owner*, which we are not. Use
the **Places API (New)**, server-side only, key in env
(`GOOGLE_PLACES_API_KEY`), never exposed to the browser:

1. If the link is a short link (`maps.app.goo.gl`, `goo.gl/maps`), follow the
   redirect server-side to get the full URL.
2. Extract the business name and coordinates from the resolved URL, then resolve
   the place with **Text Search** (`places:searchText`) biased to those
   coordinates. The `ftid`/`cid` hex in a Maps URL is *not* an officially
   convertible place id — do not build on it.
3. Fetch Place Details with an explicit field mask.

**What you actually get** — this corrects two assumptions in the original spec:

| Field | Available | Maps to |
|---|---|---|
| `displayName` | yes | `firm_settings.firm_name` |
| `formattedAddress` + `addressComponents` | yes | `address_line`, `locality`, `region`, `postal_code`, `country` |
| `location.latitude/longitude` | yes | `latitude`, `longitude` |
| `nationalPhoneNumber` | yes | `phone` (and suggest as `whatsapp`) |
| `googleMapsUri` | yes | `google_maps_url` |
| `primaryTypeDisplayName` | yes | `business_category` |
| `regularOpeningHours` | yes — **the full week**, not just today | `opening_hours` jsonb |
| `websiteUri` | often present | show it; drives the "already has a site" check |
| `rating`, `userRatingCount` | yes | see the ICAI warning below |
| `businessStatus` | yes | warn when not `OPERATIONAL` |
| Email | **no** | manual |
| Social links | **no** | manual |
| WhatsApp | **no** | manual, default to the phone number |

**Non-negotiables for this phase:**

- **Prefill, never auto-commit.** Every fetched value lands in a review panel with
  a per-field accept control, and accepted fields are recorded as `verified` with
  the source noted — the `_status` discipline, applied to a live form. Nothing
  writes straight to `firm_settings`.
- **ICAI:** a fetched `rating` must never enable reviews or ratings on a `cafirm`
  tenant. Store it or drop it, but do not let it flip `reviewsEnabled`. Put the
  guard in the action, not just the UI.
- Record a `lastVerifiedAt` alongside anything sourced from Google, and do not
  treat Google-sourced content as ours to keep indefinitely — refetch on demand
  rather than persisting a stale mirror of their content.
- Handle every failure in plain words: bad link, no match, ambiguous match (offer
  the top 3 to pick from), quota exceeded, no API key configured. A failed fetch
  must leave the manual form fully usable.
- Opening hours: Google returns per-day periods; map them into the existing
  `OpeningHour[]` shape (`{ day, opens, closes, closed }`) and show a 7-row
  editable grid regardless of what came back.

---

## 5. Phase 3 — branding and assets

**The blocker nobody has hit yet:** `uploadPropertyImage` writes to
`public/uploads/...` on disk. Its own comment admits this is "correct for local
development … but not a production deployment target as-is" — **Vercel's
filesystem is ephemeral**. A logo uploaded through the dashboard in production
disappears. Fix the storage layer before building the upload UI, or the feature
ships broken.

**Do:**

1. Move uploads to object storage (Vercel Blob is the path of least resistance —
   the action already isolates it behind one signature). Keep `logoUrl` as the
   column; it already holds a URL or a path.
2. `sharp` is currently a **devDependency**. Runtime resizing in a Server Action
   needs it as a real `dependency`. Move it, or do the resizing at upload time in
   a script — decide, and say which.
3. **Logo normalisation** (the requirement: "whatever logo comes in should fit
   perfectly"): accept PNG/JPEG/WebP/SVG, trim transparent padding, fit to a
   fixed height box preserving aspect ratio, output a transparent PNG plus a
   WebP. Reject files that would render illegibly small, and say why. Show a live
   preview of the logo **in the actual header and footer**, on both light and
   dark backgrounds, before saving.
4. **Favicons:** `lib/brand-icons.ts` hardcodes `ICON_SETS` — only
   `high-properties` has icons. Derive the 32/180/192/512 set from the uploaded
   logo automatically (square canvas, padded, centred) and read the set from the
   database instead of that object. A tenant without icons must keep falling back
   to the app default and must never inherit another client's mark.
5. **OG image:** `app/site/[tenant]/(public)/opengraph-image.tsx` reads
   `public/brand/og-hero.jpg` — the same photo for every client, and it is named
   explicitly in `next.config.ts` `outputFileTracingIncludes`, so a per-client
   file needs that config updated too. Allow a per-client override, fall back to
   the shared image, and keep the tracing config correct for whichever you choose.

---

## 6. Phase 4 — SEO, without an SEO form

**Requirement from the client:** a non-technical user cannot write SEO metadata
for 39 page types and thousands of generated pages. So do not ask them to.

**Design: derive everything, expose two paste-once fields, offer one override.**

1. **Two real inputs**, both paste-once and clearly technical:
   `ga4MeasurementId` and `searchConsoleVerification` — both columns already
   exist. Label them "paste from Google Analytics / Search Console", with a
   one-line "where do I find this".
2. **Homepage title/description: generated, not typed.** Compose from fields the
   user has already filled — firm name, business category, locality, region,
   established year, top service or property types — using a per-vertical pattern
   held in code. Render a **live Google-result preview** with character counts and
   a traffic-light length indicator.
3. **One override control**, collapsed by default: "Write these myself". Opening
   it reveals two textareas prefilled with the generated text. `seoTitle` /
   `seoDescription` on `firm_settings` already exist — null means "use the
   generated one". Never write the generated text into the override columns, or
   it stops tracking later edits.
4. **Every other page family stays generated in code** — properties, localities,
   sectors, vastu, home-loan, services, updates. They already are. Do not add
   per-page SEO fields to any content screen except the two that already have
   them (`professional_updates.seoTitle/seoDescription`), and keep those
   collapsed by default too.
5. **Replace the rest of the "SEO section" with a readiness panel** — a checklist,
   not inputs. Reuse `scripts/check-content.ts`'s logic rather than duplicating
   it: logo present, OG image present, NAP complete, opening hours set, GA4 set,
   Search Console verified, N localities with unique descriptions at or above the
   minimum length (the doorway-page check), sitemap URL count, robots status,
   custom domain resolving. Each row links to the field that fixes it.

That panel is the actual deliverable of this phase. It turns SEO from data entry
into a to-do list, which is what a non-technical operator can act on.

---

## 7. Phase 5 — hero copy

`lib/premium-v2/positioning.ts` holds per-client hero copy keyed by slug, with one
entry (`evergreen-real-estate`) and a `DEFAULT`.

**Do:** move the copy to the database (a `hero_copy` jsonb on `clients`, or
columns on `firm_settings` — pick one and justify it in a comment), keep `DEFAULT`
in code as the fallback for a client that has not customised it, and build a hero
editor with a **live preview of the actual hero component**.

Fields: `eyebrow`, `headline[0]`, `headline[1]`, `blurb`, `searchPlaceholder`, and
the four stat tiles (`kind`, `label`, `icon`, and `value` only when
`kind === "claim"`).

**Two things to preserve, both already documented in that file:**

- `blurb` is a **string template with a `{firm}` placeholder, not a function** —
  the resolved copy is passed to `HeroV2`, a Client Component, and functions
  cannot cross that boundary. Keep it a string. Show the placeholder in the UI as
  an insertable token, and preview it resolved.
- Stat *values* for non-`claim` kinds are **counted from the client's live
  inventory at render time**, so they cannot drift from what the site shows. The
  editor picks the *kind* and the *label*; it must not let anyone type a number
  over a counted stat. Only `kind: "claim"` takes a typed value — and a claim is a
  factual assertion about a real business, so record it as client-confirmed.

`icon` is a fixed union (`Award | Users | Signpost | ShieldCheck | Trees | Ruler |
IndianRupee`) — render an icon picker, never a free text field.

---

## 8. Phase 6 — vertical-scoped content screens

**The mechanism already exists.** `lib/verticals/*` (`cafirm`, `realestate`) holds
`nav`, `footer`, `dashboardNav`, `sitemapPaths`, `serviceCategories`,
`calculatorKeys` and `defaults` per vertical. The dashboard must drive off
`getVerticalConfig(client.vertical)` rather than growing its own conditionals.

| Screen | Vertical |
|---|---|
| Profile / contact / hours / socials / branding / SEO | both |
| Services, Updates, Legal pages, Team, Office locations, Queries | both |
| Properties (+ images), Localities | realestate only |
| Compliance calendar, Calculators | cafirm only |
| Feature toggles: map, property management, vastu, home loan | realestate + `premium-v2` only |

Rules:

- A screen for the wrong vertical must not merely be hidden in nav — its Server
  Actions must refuse, since an action is a reachable endpoint.
- `services.category` is validated against
  `getVerticalConfig(...).serviceCategories` at the application layer
  (deliberately not a pgEnum — see the schema comment). Render it as a select fed
  from that list.
- **Vertical is locked after creation.** Content tables are vertical-specific; a
  CA firm switched to real estate has compliance events and no properties.
  Changing it is a migration, not a dropdown. Enforce that in the action.

---

## 9. Field inventory

`fs` = `firm_settings`, `c` = `clients`. **New** marks work this brief creates.

### Identity (create-time)

| Field | Column | Notes |
|---|---|---|
| Client ID (slug) | `c.slug` | permanent, in the URL, validated against `SLUG_PATTERN` |
| Business name | `c.display_name` + `fs.firm_name` | |
| Vertical | `c.vertical` | locked after creation |
| Template | `c.template_key` | **New** (Phase 0A) — only `premium-v2` today |
| Custom domain | `c.custom_domain` | exists; DNS is a human step |
| Active | `c.is_active` | must be enforced (Phase 0D) |
| Demo tenant | `c.is_demo` | exists, low priority |

### Business details

| Field | Column |
|---|---|
| Tagline / Overview / Established year | `fs.tagline`, `fs.overview`, `fs.established_year` |
| Registration number (RERA / ICAI) | `fs.firm_registration_number` |
| Business category | `fs.business_category` |
| Phone / WhatsApp / Email | `fs.phone`, `fs.whatsapp`, `fs.email` |
| Notification email (leads land here) | `fs.notification_email` |
| Address, locality, region, postcode, country | `fs.address_line`, `fs.locality`, `fs.region`, `fs.postal_code`, `fs.country` |
| Lat / Long / Maps URL | `fs.latitude`, `fs.longitude`, `fs.google_maps_url` |
| Opening hours | `fs.opening_hours` jsonb — `OpeningHour[]`, 7-row grid |
| Social links | `fs.social_links` jsonb — Facebook, Instagram, LinkedIn, YouTube, X |

### Branding

| Field | Where | Notes |
|---|---|---|
| Logo | `fs.logo_url` | needs object storage + normalisation (Phase 3) |
| Favicon set | **New** | derive from logo; replaces `ICON_SETS` in `lib/brand-icons.ts` |
| OG image | **New** | per-client override of `public/brand/og-hero.jpg` |

### SEO

| Field | Column |
|---|---|
| GA4 measurement ID | `fs.ga4_measurement_id` |
| Search Console verification | `fs.search_console_verification` |
| Title / description override | `fs.seo_title`, `fs.seo_description` (null = generated) |

### Section toggles (already in the DB — wire them up as-is)

`fs.reviews_enabled` (ICAI-guarded), `fs.pricing_enabled`, `fs.awards_enabled`,
`fs.client_logos_enabled`, `fs.team_enabled`.

### Feature toggles (**New** — `c.features` jsonb, Phase 0C)

`propertyMap`, `propertyManagementSection`, `propertyManagementPage`,
`vastuSectors` (hard-capped), `homeLoan` (DSA confirmation required).

### Hero copy (**New** — Phase 5)

`eyebrow`, `headline[0]`, `headline[1]`, `blurb` (`{firm}` token),
`searchPlaceholder`, 4 × stat `{ kind, label, icon, value? }`.

### Repeating content — already scoped per client, screens partly exist

`properties` (+ `property_images`), `localities`, `services`,
`professional_updates`, `legal_pages`, `team_members`, `office_locations`,
`compliance_events`, `calculators`. Managers exist for several under
`components/dashboard/`. **Team members and office locations have no dashboard
screen yet** — they are seeded from YAML only. Add them.

---

## 10. YAML vs database — resolve this explicitly

Today `clients/<slug>/*.yaml` is the seed source, and `pnpm seed:client <slug>
--force` **overwrites dashboard edits** (`set: force ? values : { updatedAt }`).
Once a non-technical user is editing through a dashboard, two sources of truth is
a data-loss bug waiting to happen.

**Decision to implement:** the database is authoritative for everything the
dashboard edits. YAML stays as the bootstrap and audit record.

1. Make `--force` refuse to run against a client whose `firm_settings.updated_at`
   is newer than the YAML file, unless an explicit `--overwrite-dashboard-edits`
   flag is passed. Print what it would clobber.
2. Add `pnpm export:client <slug>` — regenerates `clients/<slug>/*.yaml` from the
   database, so `pnpm check:content` keeps working and git keeps an audit trail of
   what a live site says.
3. A client created in the dashboard has no YAML folder, and `check-content.ts`
   iterates `clients/` directories — so it will silently skip that client. Either
   have the wizard write the folder on create, or teach `check-content.ts` to read
   from the database. Pick one, say which, and make sure a dashboard-created
   client is not invisible to the pre-delivery check.

---

## 11. Decisions you may not make alone

Stop and ask before:

- adding a database read to `proxy.ts` (taxes every request, cross-region)
- changing the `unstable_cache` revalidate window, or removing a cache layer
- enabling `vastuSectors` for **any tenant beyond those that already have it**
  — each one adds ~3,700 prerendered routes; three was the most that ever
  shipped (a 32-minute build) and a 4th blew the deployment output limit and
  failed after 41 minutes. Exactly **one** tenant carries it today, so read this
  as "one more than now", not as an ordinal — the earlier wording, "a 4th
  tenant", implied that the 2nd and 3rd were free.
- flipping `reviewsEnabled` on a `cafirm` tenant (ICAI)
- changing a tenant's `vertical` after creation
- deleting a client, or anything that cascades — `onDelete: cascade` is on every
  content table, so a delete is unrecoverable. Build **deactivate**, not delete.
- introducing a new external service or paid API beyond Google Places
- weakening `assertOwnership` or the platform auth gate

---

## 12. Explicitly out of scope (next revision)

- **Multiple dashboard users / roles for the platform dashboard.** One operator,
  env-based auth. The *tenant* `users` table and its admin/editor roles already
  exist and stay as they are — the wizard creates the tenant admin, nothing more.
- A second template. `TEMPLATE_REGISTRY` should make adding one a data change, but
  do not build one now.
- Bulk import of properties/localities from a spreadsheet.
- Client-facing access to the platform dashboard. Never.

---

## 13. Definition of done

A team member with no terminal, no editor and no repo access can:

1. sign in at `/`, see every client, and open any client's live site or dashboard;
2. create a new client — paste a GBP link, review the autofill, upload a logo,
   confirm details, press Create;
3. get a working, correctly branded, correctly templated live site with favicons,
   OG image and sitemap entries — **without a deploy** for anything runtime, and
   with any deploy-dependent item clearly labelled as such on screen;
4. turn sections and features on and off with the consequences stated in plain
   words;
5. see, before handover, exactly which fields are still placeholder or pending.

And: `pnpm build` is green, `pnpm check:content <new-slug>` reports on the new
client, no tenant can read or write another's rows, and no public page has been
pushed into dynamic rendering.
