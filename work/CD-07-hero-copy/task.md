# CD-07 — Homepage hero copy editor

## Work Item

Per-client hero copy is hardcoded in `lib/premium-v2/positioning.ts`, keyed by
slug. Move it to the database and give the dashboard an editor with a live
preview, keeping the two design constraints that file already documents.

## Affected Tenants

The five real-estate tenants. `evergreen-real-estate` currently has custom copy
(`FARMHOUSE`); the other four render `DEFAULT`. `arora-k-associates` is
unaffected — the hero belongs to the `premium-v2` template.

## Vertical

`realestate` / `premium-v2` only.

## Global or Per-Client Gated

**Per-client**, with a global fallback. `DEFAULT` stays in code as the copy for
any client that has not customised it, so a newly created tenant has a working
hero with no data entry.

## Expected User-Visible Outcome

In the client dashboard, a Hero section: eyebrow, two headline lines, blurb,
search placeholder, and four stat tiles. A live preview of the real hero
component updates as fields change. Saving changes the client's home page.

## Current State

`lib/premium-v2/positioning.ts` defines:

- `HeroCopy` — `eyebrow`, `headline: [string, string]`, `blurb`,
  `searchPlaceholder`, `stats: HeroStat[]`
- `HeroStat` — `kind` (`listings` | `corridors` | `medianPlot` | `medianPrice` |
  `claim`), `label`, optional `value`, `icon`
- `icon` is a fixed union: `Award | Users | Signpost | ShieldCheck | Trees |
  Ruler | IndianRupee`
- `DEFAULT`, `FARMHOUSE`, and `BY_CLIENT = { "evergreen-real-estate": FARMHOUSE }`
- `heroCopyFor(clientSlug, firmName)` resolves and substitutes `{firm}`

Two constraints are documented in that file and must survive:

1. **`blurb` is a string template with a `{firm}` placeholder, not a function.**
   The resolved copy is passed to `HeroV2`, which is a Client Component, and
   functions cannot cross that boundary ("Functions cannot be passed directly to
   Client Components").
2. **Stat *values* for non-`claim` kinds are counted from the client's live
   inventory at render time**, precisely so they cannot drift from what the site
   is actually showing. Only `kind: "claim"` carries a typed value.

## Required Changes

1. Store hero copy per client. Choose between a `hero_copy` jsonb column on
   `clients` and columns on `firm_settings`; implement one and justify the choice
   in a comment. Nullable / empty means "use `DEFAULT`".
2. Keep `DEFAULT` in code as the fallback. Migrate `evergreen-real-estate`'s
   `FARMHOUSE` copy into its row in the migration, then remove `BY_CLIENT`.
3. `heroCopyFor` resolves from the row, keeps substituting `{firm}`, and stays
   the single place that knows the fallback rule.
4. Editor UI:
   - `eyebrow`, `headline[0]`, `headline[1]`, `searchPlaceholder` — plain text
     with length guidance matched to the design;
   - `blurb` — textarea with `{firm}` offered as an **insertable token**,
     previewed resolved;
   - four stat tiles — `kind` as a select, `label` as text, `icon` as an **icon
     picker restricted to the seven-name union**, and `value` shown **only** when
     `kind === "claim"`;
   - a live preview rendering the real hero component.
5. A `claim` value is a factual assertion about a real business ("12+ Years Local
   Expertise", "500+ Families Placed"). Record it as client-confirmed, and label
   the field so the operator knows it must come from the client.

## Acceptance Criteria

1. `evergreen-real-estate` renders its current hero copy verbatim after
   migration — eyebrow, both headline lines, blurb with `{firm}` resolved,
   placeholder, and all four stat tiles with the same kinds, labels and icons.
2. The other four tenants render `DEFAULT` exactly as today.
3. A client with no stored hero copy renders `DEFAULT`.
4. `blurb` remains a string end to end. No function is passed to `HeroV2`, and
   `{firm}` resolves in both the preview and the rendered page.
5. `value` cannot be set for a non-`claim` stat — enforced in the Server Action,
   not only hidden in the UI. Counted stats still count from live inventory, and
   changing a client's inventory changes the number without any edit here.
6. `icon` accepts only the seven names. An arbitrary string is refused by the
   action.
7. Exactly four stat tiles — no more, no fewer — enforced by the action.
8. Saving updates the public home page within the cache window, without a
   redeploy.
9. The editor is reachable only by an authorised user, and its action asserts
   ownership of the client it writes.
10. `pnpm build` green; the home page of every real-estate tenant still
    prerenders; no route became dynamic.

## Evidence Required

- **AC 1 and 2:** the rendered hero of all five real-estate tenants before and
  after — eyebrow, headlines, blurb, placeholder, four stat labels and values.
  This is the regression bar; a wrong headline on a live client site is the
  failure mode.
- **AC 5:** a counted stat's number shown to change when inventory changes, and
  a direct POST attempting to set `value` on a counted stat, refused.
- **AC 6 and 7:** both refusals, executed.
- **AC 8:** an edit reflected on the public page faster than the 300s window.
- **Build:** `pnpm build` with the prerender summary for the five tenants.

## Non-Goals

- Editing any other section's copy. Hero only.
- New stat kinds or new icons.
- A rich-text editor. Plain text plus the `{firm}` token.
- Per-page hero copy. One hero per client.

## Constraints

- `HeroV2` is `"use client"`. Nothing may pass it a function, and it must not do
  a lookup. It receives resolved copy as props.
- No `Date.now()`, `new Date()` or `Math.random()` during render in the preview —
  that is a hydration mismatch.
- Template copy belongs in `lib/premium-v2/`, not inside components.
- A shared `premium-v2` component reaches all five real-estate clients. State the
  blast radius of anything touched under `components/`.

## Reference

`docs/client-dashboard-brief.md` §7, §9, §11.
