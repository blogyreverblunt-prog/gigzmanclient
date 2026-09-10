# CD-03b — Platform dashboard: create-client wizard

## Work Item

A non-technical team member creates a new client end to end from the platform
dashboard — no code edit, no `pnpm seed:client`, no terminal. This is the point
of the whole programme: CD-01 and CD-02 exist so that a new `clients` row is
sufficient.

**Depends on CD-03a**, which builds the gated list, the edit form and the
revalidation tag this increment reuses. Do not start until CD-03a is
`VERIFY_PASS`.

> This task file is deliberately lighter than CD-03a's. Refine it after CD-03a
> lands — that increment will settle the form components, the action shape and
> the revalidation mechanics this one builds on, and specifying them twice would
> mean specifying them wrong once.

## Affected Tenants

None existing. It **creates** tenants, so a defect reaches every future client.
The six existing tenants must be unaffected.

## Vertical

Both. The wizard chooses the vertical and must apply that vertical's defaults
from `getVerticalConfig(vertical).defaults`.

## Global or Per-Client Gated

Neither — platform infrastructure.

## Expected User-Visible Outcome

Press **New client**, fill a grouped form, press Create, land on the new client's
edit screen with its live URL shown and the tenant admin password displayed once.
Open that URL and see a working, correctly templated site.

## Required Changes

### The wizard

One page, grouped sections: Identity → Business details → Features → Review &
create. Fields per `docs/client-dashboard-brief.md` §9. Sections owned by later
increments — GBP autofill (CD-04), logo upload (CD-05), SEO (CD-06), hero copy
(CD-07) — are **out of scope**: leave the plain fields they will later enrich and
do not stub their UI.

### What Create must do, in one transaction where the driver allows

1. insert `clients` — slug, vertical, displayName, **templateKey**, customDomain,
   isActive, features;
2. insert `firm_settings` with that vertical's defaults from
   `getVerticalConfig(vertical).defaults` — this is what keeps `reviewsEnabled`
   false on a `cafirm` tenant;
3. seed that vertical's calculators from `lib/calculators/registry`
   (`calculatorKeys`), as `scripts/seed-client.ts` does;
4. create the tenant admin `users` row with a generated password and **show it
   once**, with a copy control and a "shown once" warning — mirror the seed
   script, do not silently skip it;
5. invalidate the CD-03a cache tag so the new client resolves immediately;
6. redirect to its edit screen showing the live URL.

**`templateKey` is not optional for a `realestate` client.** A row without one
404s every page — `getTenantBySlug` enforces that since CD-01. The wizard must
make it impossible to create a realestate client without a valid template key
from `TEMPLATE_REGISTRY`.

### Slug rules

Lowercase, validated against `SLUG_PATTERN` **imported from `proxy.ts`** — do not
re-type the regex. Auto-suggest from the business name, check uniqueness live,
and state in plain words that the slug is permanent because it is in the URL.

### Standing finding assigned here

**`sitemapClients()` filters only on `isActive`.** A `realestate` row with a null
or unrecognised `template_key` still receives core/properties/localities entries
built on `getTenantPath`'s two-segment fallback — URLs that `proxy.ts` bounces to
`/`. Unreachable while the template map was hardcoded; **this increment is what
makes a half-configured client possible**, so it owns the fix. Decide what a
sitemap should do with an incompletely configured tenant and say so.

## Acceptance Criteria

1. Creating a client produces `clients`, `firm_settings`, calculator rows and an
   admin `users` row equivalent to what `pnpm seed:client` produces for the same
   input.
2. The generated admin password is shown exactly once, with a copy control, and
   never again on reload.
3. A client created through the wizard renders a working site at its live URL
   **with no code change and no redeploy**.
4. A `realestate` client cannot be created without a valid `templateKey`.
5. A `cafirm` client is created with `reviewsEnabled: false`.
6. Slug validation uses `SLUG_PATTERN` imported from `proxy.ts`, rejects
   duplicates before submit, and states that the slug is permanent.
7. Every action re-checks `requirePlatformAdmin()`.
8. A half-configured client does not appear in the sitemap with URLs that bounce
   to `/`.
9. The six existing tenants render identically to their pre-change baseline.

## Evidence Required

- **The full create flow**, end to end: create a throwaway client, show the
  resulting rows in all four tables, load its live URL and record the status code
  and what rendered, then deactivate it.
- **AC 3 is the headline** — a working site with no deploy. Everything before it
  was groundwork for exactly this.
- AC 2, 4, 5, 6, 7 each attempted and observed.
- **Regression:** the six existing tenants' prerendered counts, status sweep and
  sitemap URL sets.
- `pnpm check:content <new-slug>` — see the constraint below.

## Non-Goals

- GBP autofill, brand assets, SEO panel, hero copy, content screens.
- Multiple platform users or roles.
- Deleting a client — build deactivate.
- Shelling out to `pnpm seed:client` from a Server Action. The wizard does its
  own inserts; the seed script stays the bootstrap-from-YAML path.

## Constraints

- **A dashboard-created client has no `clients/<slug>/` folder**, and
  `scripts/check-content.ts` iterates directories under `clients/` — so it will
  **silently skip** that client and exit successfully, which reads as a pass.
  That is CD-09's problem to solve, but this increment is what creates the
  condition: note it prominently and do not let it look like a clean bill of
  health.
- Nothing here may cause a public tenant route to read `headers()`.
- `onDelete: cascade` means a mistaken delete is unrecoverable — there is no
  delete in this increment.

## Reference

`docs/client-dashboard-brief.md` §3, §9, §11, §12. `work/CD-03a-*/` for the
patterns this builds on.
