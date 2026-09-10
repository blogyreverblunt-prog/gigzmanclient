# CD-05 — Brand assets: durable storage, logo normalisation, favicons, OG image

## Work Item

A team member uploads a client's logo and gets a correctly sized logo everywhere,
a full favicon set and a share card — without touching the repo. This requires
fixing the storage layer first: the existing upload path writes to a filesystem
that does not persist in production.

## Affected Tenants

All six for the favicon and OG changes (both are read per tenant today, with only
`high-properties` configured). The storage fix affects every property image
already uploaded through the tenant dashboard.

## Vertical

Both.

## Global or Per-Client Gated

**Global mechanism, per-client data.** `lib/brand-icons.ts` and the OG image route
are shared code paths reached by every tenant; a defect there gives one client
another client's mark.

## Expected User-Visible Outcome

In the client form: upload a logo, see it previewed in the real header and footer
on light and dark backgrounds before saving, and on save get a normalised logo,
a 32/180/192/512 favicon set and a share card — all per client.

## Current State

- `lib/actions/dashboard-actions.ts:558` — `uploadPropertyImage` writes to
  `public/uploads/{clientId}/{propertyId}/`. Its own comment states this is
  "correct for local development and the demo library but not a production
  deployment target as-is", because **Vercel's filesystem is ephemeral**. Files
  uploaded in production do not survive. The comment names the intended fix:
  object storage, behind the same action signature.
- `firm_settings.logo_url` exists and holds a path or URL. Current logos are
  committed files at
  `public/verticals/realestate/templates/premium-v2/brand/<slug>-logo.png`.
- `lib/brand-icons.ts` hardcodes `ICON_SETS` — only `high-properties` has icons.
  A tenant with no entry correctly falls back to the app default.
- `app/site/[tenant]/(public)/opengraph-image.tsx` reads
  `public/brand/og-hero.jpg` from disk — the same photograph for every client.
  That file is named explicitly in `next.config.ts` `outputFileTracingIncludes`
  because files under `public/` are not traced into a function's bundle; without
  it the card renders with no photograph.
- `sharp` is a **devDependency**. Runtime resizing in a Server Action needs it as
  a real dependency.

## Required Changes

1. **Storage.** Move uploads to object storage (Vercel Blob is the least-friction
   choice and the action already isolates it behind one signature). Keep
   `logo_url` as the column. Existing committed logo paths must keep working —
   the column holds either.
2. **`sharp`.** Decide between runtime resizing (move `sharp` to `dependencies`)
   and upload-time processing in a script. Implement one, and record the choice
   and its reason in a comment.
3. **Logo normalisation.** Accept PNG/JPEG/WebP/SVG. Trim transparent padding,
   fit to a fixed height box preserving aspect ratio, emit a transparent PNG plus
   a WebP. Reject a file that would render illegibly small, and say why. Validate
   type and size server-side regardless of the browser's `accept` attribute, and
   never trust the uploaded filename — follow the randomised-name pattern the
   existing action already uses.
4. **Favicons.** Derive 32/180/192/512 from the uploaded logo (square canvas,
   padded, centred). Read the set from the database instead of `ICON_SETS`. A
   tenant without icons must still fall back to the app default and must never
   inherit another tenant's mark.
5. **OG image.** Allow a per-client override, falling back to the shared
   `og-hero.jpg`. If the implementation reads any new file from disk at
   generation time, add it to `outputFileTracingIncludes` — this fails silently
   otherwise.
6. **Preview.** Show the logo in the real header and footer components, light and
   dark, before saving.

## Acceptance Criteria

1. A logo uploaded through the dashboard survives a redeploy and is served from
   durable storage. Proven by deploying or by an equivalent process restart, not
   asserted.
2. Existing property images and existing committed logo paths still resolve.
3. A logo uploaded at an awkward aspect ratio or with transparent padding renders
   correctly sized in the header and footer without manual intervention.
4. An unsupported type, an oversized file and an image too small to render
   legibly are each rejected with a plain-language reason.
5. Favicons are derived automatically and served per tenant; a tenant with no
   logo gets the app default and never another tenant's icons. Verified for at
   least two tenants plus one with none.
6. `ICON_SETS` no longer hardcodes tenant slugs.
7. The OG card renders per client where overridden and falls back to the shared
   image otherwise — **with its photograph present**, confirmed on a production
   build, not only in dev.
8. `pnpm build` green; no public route became dynamic; prerendered counts
   unchanged.
9. The upload action still re-checks auth and ownership, still validates type and
   size server-side, and still never trusts a client-supplied filename.

## Evidence Required

- **Durability:** the AC 1 proof — upload, restart/redeploy, re-request the URL,
  record the status.
- **Normalisation:** before/after renders of at least three awkward inputs (wide,
  tall, heavily padded), shown in the actual header.
- **Favicons:** the served icon URLs for two configured tenants and one
  unconfigured, with status codes.
- **OG card:** the generated image for one overridden and one falling back,
  from a production build, confirming the photograph is present.
- **Regression:** an existing property image still loads; an existing committed
  logo path still resolves.
- **Build:** `pnpm build` with the prerender summary.

## Non-Goals

- A media library or asset browser.
- Bulk logo import for the existing six tenants — they have committed files that
  keep working.
- Redesigning the header or footer.
- Client-side image editing (crop, rotate).

## Constraints

- Uploaded images must not be trusted: type and size validated server-side,
  filenames randomised, and SVG handled with the same caution
  `next.config.ts` already documents (`dangerouslyAllowSVG` is on for
  locally-sourced partner logos only, sandboxed and script-free — an uploaded SVG
  is not in that category).
- `next.config.ts` `outputFileTracingIncludes` and `images` config must agree
  with the code. Both fail silently — a warning, or a share card with no
  photograph.
- Any new external service is a §11 decision: raise it, do not adopt it.

## Reference

`docs/client-dashboard-brief.md` §5, §9, §11.
