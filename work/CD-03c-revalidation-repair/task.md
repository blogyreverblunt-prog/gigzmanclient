# CD-03c — Repair the dead `revalidatePath` calls in the tenant dashboard

## Work Item

Every `revalidatePath` call in `lib/actions/dashboard-actions.ts` — about 30 of
them across 15 actions — is a **no-op**. Tenant-dashboard edits have never
reached the public site except by waiting out the 300-second cache expiry, while
the UI says "Saved." Replace them with the tag-based invalidation CD-03a builds.

**Depends on CD-03a**, which creates `lib/cache-tags.ts` and the tagged
`unstable_cache` wrappers this increment reuses. Do not start before it is
`VERIFY_PASS`.

## Affected Tenants

All six. Every tenant with a dashboard user is affected today.

## Vertical

Both. The dead calls span property, locality, update, compliance, calculator and
settings surfaces.

## Global or Per-Client Gated

**Global** — one shared actions module, and the fix reaches every tenant that
edits anything.

## Expected User-Visible Outcome

A tenant admin edits a property, a locality, an update or their firm settings,
and the change appears on their public site within seconds instead of up to five
minutes. The "Saved." message stops being a lie.

## Why this is real, with the mechanism

Verified against Next 16.3.3's source during CD-03a's architecture, not inferred:

- `revalidatePath(path)` emits exactly one tag, `_N_T_<path>`
  (`node_modules/next/dist/server/web/spec-extension/revalidate.js:91`).
- The tags a rendered entry actually carries come from `getImplicitTags` →
  `getDerivedTags` (`node_modules/next/dist/server/lib/implicit-tags.js:27-33`,
  `:70-71`): one `…/layout` tag per **route-pattern** prefix, the `…/page` tag,
  and the resolved pathname.
- So a properties page carries `_N_T_/site/[tenant]/(public)/layout` and
  `_N_T_/site/<slug>/properties`. It never carries `_N_T_/site`, and it never
  carries `_N_T_/site/dashboard/settings` — neither of which is a real rendered
  route.
- **No warning fires.** The missing-`type` warning is gated on
  `isDynamicRoute(originalPath)` (`revalidate.js:94`), and `"/site"` has no
  dynamic segment. That is why this survived unnoticed.

`revalidateTag(tag)` single-arg is **deprecated** in 16.3.3 (`:44`) and
`revalidateTag(tag, "max")` serves stale for a year. **`updateTag(tag)` is the
correct call** and is Server-Action-only (`:54-59`) — which is exactly where
these run.

## Required Changes

1. Replace each dead `revalidatePath` pair with the CD-03a tag helpers —
   `updateTag(tenantDataTag(user.clientId))`, plus `updateTag(tenantSlugTag(slug))`
   where the slug is in scope.
2. Where a path-based call is genuinely wanted, it must carry the **route
   pattern plus a type** (`revalidatePath("/site/[tenant]/(public)/properties", "page")`),
   not a literal path that matches nothing.
3. Remove the asymmetry note CD-03a placed in `lib/content.ts` — the one saying
   platform edits propagate and tenant edits do not. Once this lands it is false,
   and a stale comment is the defect class this pipeline has fixed three times.
4. Audit every remaining `revalidatePath` in the repo, not only the ones in
   `dashboard-actions.ts`, against the same rule.

## Acceptance Criteria

1. Editing firm settings from a **tenant** dashboard is visible on that tenant's
   public site within seconds, not on expiry.
2. The same for a property, a locality and an update — the four highest-traffic
   edit paths.
3. No `revalidatePath` call anywhere in the repo passes a path that matches no
   rendered entry. Every remaining one carries a route pattern and a type, or is
   replaced by a tag.
4. Invalidating one tenant does not expire another tenant's cached pages.
5. `lib/content.ts`'s asymmetry note is removed, and no comment claims behaviour
   the code no longer has.
6. The six tenants' prerendered counts, status sweep and sitemap URL sets are
   unchanged.

## Evidence Required

- **AC 1 and 2 executed against a running server**, timed: edit → request the
  public page → observe the change without waiting 300s. A claim that the tag is
  correct is not evidence; the observed propagation is.
- **AC 4:** edit tenant A, confirm tenant B's page is still served from cache.
  This is the isolation property and it is the one most likely to be got wrong by
  reaching for a coarse tag.
- The repo-wide `revalidatePath` audit, listing every call and its verdict.
- `pnpm build` green; per-tenant prerendered counts unchanged.

## Non-Goals

- Redesigning the caching layers or changing the 300s window.
- Adding tags to `getPropertyImagesFor` — CD-03a records that it is keyed by
  property ids and cannot carry a tenant tag; changing that is a separate design
  question.
- Any platform-dashboard work.
- Any schema change.

## Constraints

- **This is a shared actions module reaching all six tenants.** A coarse tag that
  expires every tenant on any edit would pass ACs 1–3 and fail AC 4 — and would
  quietly undo the cross-region caching that `AGENTS.md` says is not optional
  polish (functions in `bom1`, pooler in `ap-southeast-2`).
- `updateTag` throws outside a Server Action. Anything not in an action needs
  `revalidateTag(tag, "max")` and its year-long stale window understood, or a
  different approach.
- There is no test suite. `pnpm build` is the typecheck.

## Reference

`work/CD-03a-dashboard-list-edit/architecture-plan.md` — the caching analysis,
the tag helpers, and Open Decision 1 where this increment was split out.
