# CD-04 — Google Business Profile autofill

## Work Item

A team member pastes a Google Maps / Business Profile link into the client form,
presses Fetch, reviews what came back field by field, accepts what is correct,
and saves. Nothing is written to the client's settings without a human accepting
it.

## Affected Tenants

None directly. It is a platform-dashboard data-entry aid that writes
`firm_settings` for whichever client is being edited. A defect writes wrong
business facts onto a real company's live website — treat it as high-blast-radius
despite touching no template code.

## Vertical

Both. A CA firm has a Google Business Profile like any other business — with one
extra constraint (see ICAI below).

## Global or Per-Client Gated

Neither — platform tooling.

## Expected User-Visible Outcome

In the client form, a "Fetch from Google" input accepting a Maps URL. After
fetching, a review panel shows each retrieved value beside the current value,
with a per-field accept control. Accepting fills the form; saving writes it, and
records the field as `verified` with Google named as the source.

## Current State

- `firm_settings` already holds every target column: `firm_name`, `phone`,
  `address_line`, `locality`, `region`, `postal_code`, `country`, `latitude`,
  `longitude`, `google_maps_url`, `business_category`, `opening_hours` (jsonb,
  `OpeningHour[]`), `social_links` (jsonb).
- `OpeningHour` is `{ day, opens, closes, closed }` and drives both the UI and
  the `openingHoursSpecification` JSON-LD.
- Nothing in the repo calls any Google API today. There is no API key wired.
- `clients/*/profile.yaml` carries a `_status` per field with a header comment
  naming the source. That discipline must extend to anything fetched here.

## Required Changes

### Resolution strategy

A pasted Maps URL is not queryable on its own, and the Business Profile API
requires OAuth as the business owner, which we are not. Use the **Places API
(New)**, server-side only, key from env (`GOOGLE_PLACES_API_KEY`), never exposed
to the browser:

1. If the link is a short link (`maps.app.goo.gl`, `goo.gl/maps`), follow the
   redirect server-side to resolve it.
2. Extract the business name and coordinates from the resolved URL, then resolve
   the place with Text Search (`places:searchText`) biased to those coordinates.
   The `ftid` / `cid` hex in a Maps URL is **not** an officially convertible
   place id — do not build on it.
3. Fetch Place Details with an explicit field mask.

### Field mapping

| Google field | Target |
|---|---|
| `displayName` | `firm_name` |
| `formattedAddress`, `addressComponents` | `address_line`, `locality`, `region`, `postal_code`, `country` |
| `location.latitude` / `.longitude` | `latitude`, `longitude` |
| `nationalPhoneNumber` | `phone`, and offered as `whatsapp` |
| `googleMapsUri` | `google_maps_url` |
| `primaryTypeDisplayName` | `business_category` |
| `regularOpeningHours` | `opening_hours` — the **full week**, not just today |
| `websiteUri` | displayed, not stored; flags "client already has a site" |
| `rating`, `userRatingCount` | see ICAI constraint below |
| `businessStatus` | warn when not `OPERATIONAL` |

Not available from any Google surface, and therefore always manual: **email**,
**social links**, **WhatsApp** (defaults to the fetched phone number).

### Review-and-accept

Fetched values land in a review panel, never straight into `firm_settings`. Each
field is accepted individually. An accepted field records `verified` plus the
source and a `lastVerifiedAt`; an unaccepted field keeps whatever it had.

## Acceptance Criteria

1. A full Maps URL and a `maps.app.goo.gl` short link both resolve to the same
   place and prefill the same values.
2. No fetched value reaches `firm_settings` without an explicit per-field accept.
   Proven by fetching, saving without accepting, and showing the row unchanged.
3. `regularOpeningHours` maps into all seven `OpeningHour` rows, including
   `closed: true` days, and the 7-row grid stays editable regardless of what
   Google returned or whether the fetch failed at all.
4. The API key is read server-side only. Grep the client bundle: it must not
   appear.
5. **A fetched `rating` never enables reviews or ratings on a `cafirm` tenant.**
   Enforced in the action, not only the UI. ICAI's Code of Ethics prohibits
   testimonials, star ratings and endorsements on a CA firm's own site.
6. Every failure path is handled in plain words and leaves the manual form fully
   usable: malformed link, no match, ambiguous match (offer the top 3 to choose
   from), quota exceeded, network failure, no API key configured.
7. Accepted fields are recorded as `verified` with Google named as the source and
   a `lastVerifiedAt` timestamp.
8. `businessStatus` other than `OPERATIONAL` produces a visible warning.
9. No public page changed, and no existing tenant's `firm_settings` was modified
   during development.

## Evidence Required

- **Happy path:** a real fetch against a real Maps URL — the resolved place, the
  mapped values, and the resulting row after accepting a subset.
- **Short link:** the same for a `maps.app.goo.gl` URL.
- **AC 2:** fetch, save without accepting, show the unchanged row.
- **AC 5:** attempt to enable reviews on `arora-k-associates` via the action
  after a fetch that returned a rating. Show the refusal.
- **Failure paths:** each of AC 6 triggered, with the message shown.
- **Key safety:** the grep of the built client bundle.
- **Build:** `pnpm build` green.

## Non-Goals

- Importing Google reviews as testimonials. Not for any vertical.
- Google Business Profile write access, OAuth, or post/photo management.
- Scheduled refresh. Fetch is on demand only.
- Any use of the Places key outside this feature.

## Constraints

- **Never invent client facts.** If a field does not come back, it stays empty
  and `pending`. An empty field renders nothing; an invented one ships a lie on a
  real business's website.
- Do not persist a Google-sourced mirror indefinitely — record `lastVerifiedAt`
  and refetch on demand rather than treating their content as ours to keep.
- The key must be documented in `.env.example`, absent from `.env.local` in the
  repo, and the feature must degrade to manual entry when it is unset. Note that
  `.env*` is gitignored and dotenv expands `$` — an unescaped `$` in that file
  has produced convincing false defects here.
- No public route may become dynamic as a result of this work.

## Reference

`docs/client-dashboard-brief.md` §4, §9, §11.
