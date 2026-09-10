# CD-03a — Platform dashboard: client list and edit screens

## Work Item

Give the team one gated screen that lists every client and lets an operator edit
an existing one — business details, custom domain, active state, section toggles
and the five feature flags CD-02 moved to the database.

**Creation is deliberately out of scope** and is CD-03b. This increment owns the
read and update paths only. Split from the original CD-03 because that increment
was ~3× the size of anything verified so far, and a smaller diff verifies far
better.

## Affected Tenants

None directly — this is the team-only platform surface at `/`, outside the tenant
route tree. But it **writes** to `clients` and `firm_settings` for any tenant, so
a defect here reaches live client sites. The six existing tenants' rendered
output must not change.

## Vertical

Both. Screens must be scoped by `getVerticalConfig(client.vertical)`.

## Global or Per-Client Gated

Neither — platform infrastructure. **No file under
`components/realestate/premium-v2/` or `app/site/[tenant]/` should be touched**,
beyond what revalidation requires.

## Expected User-Visible Outcome

A signed-in team member at `/` can:

- see every client — slug, name, vertical, template, active, custom domain, last
  updated — with links to the live site and to that client's own dashboard;
- open a client and edit its business details, custom domain, active state,
  section toggles and feature flags;
- see changes on the public site without waiting out a cache window, and see on
  screen which changes need a deploy.

## Current State

- `app/page.tsx` is already gated by `requirePlatformAdmin()`, already
  `robots: noindex`, `force-dynamic`, and `proxy.ts` already lets `/` through. It
  renders only `ClientLookupForm` — a slug box that redirects.
- **A decision this increment reverses.** That file's comment says it
  "deliberately shows no client listing — a signed-in team member opens a
  specific site by its ID, so nobody browsing this dashboard can discover a
  client they don't already know the slug for." Reverse it consciously and
  rewrite the comment: access is controlled by the platform login, not by slug
  obscurity. Keep `ClientLookupForm` as the fast path.
- Platform auth is env-based (`lib/platform-auth.ts`, `PLATFORM_ADMIN_*`, cookie
  `gz_platform_session`, 1h) and is **separate** from the tenant dashboard's
  DB-backed auth (`lib/auth.ts`, `gz_session`, 8h). Keep both. Add neither a
  third.
- `clients` now carries `templateKey` (CD-01) and `features` jsonb (CD-02).
  `firm_settings` carries the five section booleans and the whole NAP block.
- `components/dashboard/SettingsForm.tsx` is the **tenant**-side settings form.
  Read it for the house pattern; do not repurpose it — it authenticates
  differently and is scoped to one client.

## Required Changes

### Client list

Slug, display name, vertical, template, active, custom domain, live-site link,
"open client dashboard" link, last updated. Search box. Inactive rows visibly
muted. `ClientLookupForm` retained.

### Edit client

The fields in `docs/client-dashboard-brief.md` §9 that apply to an **existing**
client:

- business details, contact, address, lat/long, opening hours, social links;
- custom domain, active toggle;
- the five `firm_settings` section toggles;
- the five `clients.features` flags.

**Read-only after creation, enforced in the action and not merely disabled in the
UI:** `slug`, `vertical`. `templateKey` is editable but is a §11 decision — see
Constraints.

### Feature toggles — the guards are the substance here

Surface the five `clients.features` flags with the reasoning from their helper
comments as on-screen helper text. `lib/premium-v2/home-sections.ts`,
`lib/vastu/enabled.ts` and `lib/home-loan/enabled.ts` are the designated source
for that text — CD-02 made them so deliberately.

Two hard requirements, both enforced in the **Server Action**, not the UI:

- **`vastuSectors` is capped.** Each enabled tenant adds ~3,700 prerendered
  routes. Three is the most that ever shipped (a 32-minute build); a fourth blew
  the deployment output limit and failed the deploy after 41 minutes. **Exactly
  one tenant has it today.** The action refuses a fourth outright with that
  reason in the message; enabling even a second is a §11 decision and the UI must
  say so, naming the current count and the route cost.
- **`homeLoan` asserts a DSA relationship.** The pages state the firm is an
  authorised channel partner. Gate it behind an explicit confirmation checkbox.

`reviewsEnabled` must be refused for a `cafirm` tenant in the action — ICAI
prohibits testimonials, ratings and endorsements on a CA firm's own site.

### Revalidation — this is where the increment earns its keep

`lookupClientBySlug` is `unstable_cache(..., { revalidate: 300 })` with **no
tag**, compounding with the public layout's `revalidate = 300` to roughly ten
minutes. CD-01 and CD-02 both deferred this to CD-03 deliberately, on the grounds
that a tag nothing calls is scaffolding. It is no longer scaffolding: this
increment is the first thing that writes.

Add the tag and invalidate it from every write. Every field must state on screen
when it takes effect — revalidated on save, or next deploy for anything that
changes `generateStaticParams` or sitemap membership. **The UI must not imply a
change is live when it is not.**

### Standing findings assigned to this increment

- **`lib/domains.ts:51`** — `HOST_TENANT_MAP[clean]` is a bare index on a plain
  object, so `Host: constructor` returns the `Object` function from
  `tenantSlugForHost()`, typed `string | null`, **and** skips the
  `PRIMARY_HOST_TENANT` fallback because `??` catches only null/undefined. Same
  defect class CD-01's Amendment 1 closed three times. Fix it here — this
  increment makes `customDomain` editable, so it owns that file's correctness.
- **`getTenant()` does not enforce `isActive`.** Deferred twice, correctly. It
  stops being acceptable the moment an operator can flip the switch: a
  deactivated tenant's staff holding a live `gz_session` can still reach Server
  Actions, so writes are not stopped though nothing renders. Close it, and update
  the `lib/tenant.ts` comment that currently names this as a known gap.

## Acceptance Criteria

1. `/` lists all six clients with the stated columns, behind the existing
   platform auth. Unauthenticated access still redirects to `/login`. `/` is
   still `noindex`.
2. Editing a client's business details updates `firm_settings` and the change is
   visible on that client's public site **without waiting out the cache window**.
3. `slug` and `vertical` cannot be changed after creation — proven by a direct
   POST, not by a disabled input.
4. Every mutating Server Action re-checks `requirePlatformAdmin()` and does not
   trust a `clientId` arriving in `FormData` without re-checking it.
5. `reviewsEnabled` is refused for a `cafirm` tenant by the action.
6. Enabling `vastuSectors` on a fourth tenant is refused by the action with the
   build-limit reason. Enabling a second surfaces the §11 warning with the
   current count.
7. Enabling `homeLoan` without the DSA confirmation is refused by the action.
8. Deactivating a tenant 404s its public pages **and** stops its Server Actions;
   reactivating restores both.
9. `tenantSlugForHost("constructor")` returns the `PRIMARY_HOST_TENANT` fallback
   or null — never a function.
10. The six existing tenants render identically to their pre-change baseline:
    per-tenant prerendered counts unchanged, status sweep unchanged, sitemap URL
    sets unchanged.
11. `app/page.tsx`'s "no client listing" comment has been rewritten to state the
    new reasoning.

## Evidence Required

- **Build:** `pnpm build` green; per-tenant prerendered counts identical to the
  CD-02 baseline (`42/546/547/5005/1071/1071`).
- **Auth:** unauthenticated GET of `/` and direct POST to each new Server Action.
  A rendered layout proves nothing — POST directly.
- **Refusals:** AC 3, 5, 6, 7 each attempted and refused, with the message.
- **Revalidation:** a field edited in the UI, reflected on the public page faster
  than the ~10-minute window. This is the AC that proves the tag works.
- **AC 8:** the full deactivate → verify pages 404 **and** an action refuses →
  reactivate → verify restored cycle.
- **AC 9:** the prototype probe through `tenantSlugForHost`.
- **Regression:** the six tenants' status sweep and sitemap URL sets, before and
  after.

## Non-Goals

- **Creating a client.** CD-03b.
- GBP autofill (CD-04), logo/favicon/OG upload (CD-05), SEO panel (CD-06), hero
  copy (CD-07), team/office screens (CD-08).
- Multiple platform users or roles. One operator, env auth.
- **Deleting a client.** `onDelete: cascade` is on every content table, so a
  delete is unrecoverable. Build deactivate, not delete.
- Making the vertical nav feature-aware (the "Property Management" 404 on four
  live sites) — separate, and it touches `lib/verticals/**`.
- `sitemapClients()`'s missing template filter — CD-03b, which is what makes a
  half-configured client possible.

## Constraints

- **These toggles belong on the platform dashboard, not the tenant dashboard**,
  and that is not a placement preference. `homeLoan` asserts a DSA relationship
  the operator must verify; `vastuSectors` can fail the deployment for every
  other tenant sharing it. A tenant admin flipping either is a compliance or an
  availability incident. Ruled during CD-02.
- **Changing `templateKey` on a live client** restyles and re-routes its whole
  site. If exposed at all, it is a §11 decision with an explicit confirmation.
  Defaulting to not exposing it is acceptable and should be stated.
- Nothing here may cause a public tenant route to read `headers()`.
- A client edited here has a `clients/<slug>/` YAML folder that is now stale.
  That is CD-09's problem — note it, do not solve it.

## Reference

`docs/client-dashboard-brief.md` §3, §9, §11, §12. `current-status.md` for the
standing findings and the CD-01/CD-02 rulings this increment inherits.
