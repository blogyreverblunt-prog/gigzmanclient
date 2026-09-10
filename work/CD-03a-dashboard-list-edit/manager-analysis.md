# CD-03a — Manager Analysis

**Status: READY for architecture.**

## Summary

Build the gated client list and the edit screens for existing clients on the
platform dashboard at `/`. Add the cache tag that makes an edit visible without
waiting out a ~10-minute window. Close two standing findings that stop being
tolerable the moment an operator can edit a client.

Creation is CD-03b. This increment owns read and update only.

## Affected tenants and vertical

None directly — `/` is outside the tenant route tree. But this is the first
increment that **writes** to `clients` and `firm_settings` for an arbitrary
tenant, so a defect reaches live client sites. Both verticals; screens must be
scoped by `getVerticalConfig(client.vertical)`.

Baseline to preserve (CD-02's verified build):
`42 / 546 / 547 / 5005 / 1071 / 1071`.

## Global or per-client gated

Neither — platform infrastructure. Nothing under
`components/realestate/premium-v2/` or `app/site/[tenant]/` should change beyond
what revalidation requires.

## Current implementation

- `app/page.tsx` — `force-dynamic`, `robots: noindex`, gated by
  `requirePlatformAdmin("/")`. Renders only `ClientLookupForm`.
- `lib/platform-auth.ts` — env-based single operator. JWT via `jose` in
  `gz_platform_session`, **1h**, `httpOnly`, `sameSite: lax`.
  `verifyPlatformCredentials` compares a bcrypt hash from
  `PLATFORM_ADMIN_PASSWORD_HASH`. Entirely separate from `lib/auth.ts`.
- `app/lookup-actions.ts` — slug → redirect, already checks `isActive` and
  (since CD-01) that a realestate client has a valid `templateKey`.
- `lib/actions/dashboard-actions.ts` — the house pattern for a write action:
  `requireAdmin()`, parse `FormData` with `String(...).trim() || null`,
  `db.update().where(eq(...clientId))`, `revalidatePath(...)`, return
  `ActionResult`. **This is the tenant-side pattern** — it authenticates with
  `lib/auth.ts` and is scoped to one client. Read it for style; do not reuse it
  for platform actions.
- `components/dashboard/SettingsForm.tsx` — the tenant-side form, including the
  ICAI risk labelling on the section toggles. Good precedent for how a
  consequential toggle should be presented.

## Three findings the architect must resolve

### 1. `revalidatePath("/site")` is very likely a no-op — verify before copying it

`updateFirmSettings` ends with `revalidatePath("/site/dashboard/settings")` and
`revalidatePath("/site")`. Every public page lives at
`/site/[tenant]/(public)/...`. `revalidatePath` matches a **literal path** unless
given a route pattern plus a type, so `"/site"` plausibly revalidates nothing at
all, and neither of those strings is a real rendered route.

If that is right, **tenant-dashboard edits already do not propagate to the public
site** except by the 300s expiry — a pre-existing defect, not one this increment
introduces. The architect must determine the truth against Next 16's actual
behaviour (`node_modules/next/dist/docs/`), say so plainly, and design CD-03a's
invalidation to work rather than to look like the existing code. Whether to also
fix the tenant-side calls is a scope question for the architect to raise, not to
assume.

### 2. `lib/platform-auth.ts`'s header comment describes an architecture that no longer exists

It says it "Gates the public template-library pages (`/`, `/{vertical}`) and the
internal `/admin` deployment index". There is no `/admin` — `AGENTS.md` says `/`
itself is the single gated dashboard — and there are no public template-library
pages. Comment-contradicts-code, the defect class CD-01 and CD-02 both fixed.
This increment owns that file's surface.

### 3. `app/lookup-actions.ts`'s comment is falsified by this increment

"The only way to reach a client's site from this dashboard — no listing is ever
rendered, so a signed-in team member still needs to know the exact client ID."
CD-03a renders a listing. Same reversal as `app/page.tsx`'s comment, and both
must be rewritten rather than left contradicting the code.

## Database impact

**None.** No new column, no migration. `clients` already carries `templateKey`
(CD-01) and `features` (CD-02); `firm_settings` already carries everything the
edit form writes. If the architect proposes a schema change, that is a signal the
increment has drifted into CD-03b.

## Caching and revalidation impact

This is the increment's substance. `lookupClientBySlug` is
`unstable_cache(..., { revalidate: 300 })` with **no tag**, compounding with the
public layout's `revalidate = 300` to roughly ten minutes. CD-01 and CD-02 both
deferred the tag deliberately — "a tag nothing calls is scaffolding". That
reasoning expires here: this is the first increment that writes.

## Standing findings assigned here, and why now

- **`lib/domains.ts:51`** — `HOST_TENANT_MAP[clean]` is a bare index on a plain
  object, so `Host: constructor` returns the `Object` **function** from
  `tenantSlugForHost()` (typed `string | null`) **and** skips the
  `PRIMARY_HOST_TENANT` fallback, because `??` only catches null/undefined.
  Verified directly. Same defect class as CD-01's Amendment 1. Assigned here
  because this increment makes `customDomain` editable.
- **`getTenant()` does not enforce `isActive`.** Deferred twice, correctly, on
  the grounds that nothing exposed the switch. Something does now: a deactivated
  tenant's staff holding a live `gz_session` can still reach Server Actions, so
  writes are not stopped though nothing renders. The `lib/tenant.ts` comment
  currently documents this as a known gap and must be updated when it closes.

## Risks and conflicts

1. **This is the first write path to arbitrary tenants.** A platform action that
   fails to re-check `requirePlatformAdmin()` is a full compromise of every
   client's content, not a bug in one tenant's dashboard. Server Actions are
   reachable POST endpoints; a rendered layout proves nothing.
2. **Two flags are not preferences.** `homeLoan` asserts a DSA relationship;
   `vastuSectors` can fail the deployment for every tenant sharing it. Both
   guards must be in the action, not the UI.
3. **`reviewsEnabled` on a `cafirm` tenant is an ICAI violation**, and the
   platform form is a new path to it that the tenant-side form's risk labelling
   does not cover.
4. **Reversing the "no client listing" decision** is deliberate and must be
   recorded in the rewritten comments rather than silently dropped.

## Acceptance criteria

The eleven ACs in `task.md` stand and are all measurable.

## Tree-state caveat

CD-00, CD-01 and CD-02 are complete but **uncommitted**, so `git diff` does not
isolate this increment. Snapshot `git status --porcelain` into
`work/CD-03a-dashboard-list-edit/pre-state.txt` before any edit; anything not in
it is CD-03a's.

## Verdict

**READY.** The architect should resolve finding 1 first — the invalidation design
depends on it, and it may turn out that an existing "saved" message has been
lying to tenant admins.
