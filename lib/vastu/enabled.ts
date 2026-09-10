import { featureEnabled, type FeatureHost } from "@/lib/features";

/**
 * Which tenants publish the Gurugram sector vastu matrix.
 *
 * Two reasons this is opted into per client rather than something every
 * premium-v2 tenant gets:
 *
 * 1. Build output. The matrix is ~3,700 prerendered routes per tenant. At
 *    three tenants the production build took 32 minutes and shipped; adding a
 *    fourth pushed it past the deployment output limit and the deploy failed
 *    after a 41-minute build. Duplicating the same 137 sectors for every
 *    client buys nothing and costs the whole deploy.
 *
 * 2. Content quality. The pages differ only by sector name and the four
 *    corridor figures that sector's locality row supplies. That is thin
 *    enough to be worth opting into per client rather than switching on by
 *    default for anyone onboarded.
 *
 * The base vastu pages (facing, room, room x direction, plot size, property
 * type) stay available to every real-estate tenant — that set is small.
 *
 * This was a `Set<string>` in this file until CD-02. The gate is now
 * `clients.features.vastuSectors`, default **false** when the key is absent.
 * Because of reason 1 this is not an ordinary preference: turning it on for
 * another tenant is on `docs/client-dashboard-brief.md` §11's list of
 * decisions no agent may make alone, and it can take the deployment down for
 * every other tenant sharing it. `updateClientFeatures` in
 * `lib/actions/platform-actions.ts` enforces that as a hard cap — an explicit
 * acknowledgement for any tenant beyond those that already have it, and an
 * outright refusal at the cap — rather than as advice next to a switch. The
 * cap and its wording live in `lib/platform/feature-copy.ts` (`vastuDecision`).
 *
 * Synchronous on purpose, and it must stay that way: this is called from
 * `generateStaticParams` and from `lib/sitemap.ts`. It takes the tenant row
 * rather than a slug so the answer can only come from the row being rendered.
 *
 * This comment is the source for this flag's on-screen helper text in
 * `lib/platform/feature-copy.ts`, rendered by
 * `components/platform/FeatureToggles.tsx`.
 */
export function vastuSectorsEnabled(tenant: FeatureHost | null | undefined): boolean {
  return featureEnabled(tenant, "vastuSectors");
}
