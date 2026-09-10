import { featureEnabled, type FeatureHost } from "@/lib/features";

/**
 * Which tenants publish the home-loan pages.
 *
 * These pages display lender trademarks and describe the firm as an
 * authorised channel partner. That is only true for tenants who actually
 * hold a DSA relationship — publishing it for a tenant who does not would be
 * a misrepresentation, so it stays opt-in rather than being inferred from the
 * template key. Turn it on for a client only once the DSA relationship is
 * confirmed for that client.
 *
 * Provenance of the three tenants holding it at the time of writing:
 * `high-properties`, plus `nayra-realtors` and `urban-flat-real-estate`,
 * which were added on those clients' own confirmation. If either of the two
 * does not in fact hold a DSA relationship, turn the flag off — the pages
 * state the firm is an authorised channel partner.
 *
 * This was a `Set<string>` in this file until CD-02. The gate is now
 * `clients.features.homeLoan`, default **false** when the key is absent: a
 * tenant must be given this, never inherit it. That is also why
 * `updateClientFeatures` in `lib/actions/platform-actions.ts` refuses the
 * enable transition without an explicit DSA confirmation, rendered as a
 * checkbox by `components/platform/FeatureToggles.tsx`, rather than offering a
 * bare switch — the reason the flag is opt-in has to survive the move out of
 * source code.
 *
 * Synchronous on purpose, and it must stay that way: this is called from
 * `generateStaticParams`, from `lib/sitemap.ts` and inline in JSX. It takes
 * the tenant row rather than a slug so the answer can only come from the row
 * being rendered.
 *
 * This comment is the source for this flag's on-screen helper text in
 * `lib/platform/feature-copy.ts`, rendered by
 * `components/platform/FeatureToggles.tsx`.
 */
export function homeLoanEnabled(tenant: FeatureHost | null | undefined): boolean {
  return featureEnabled(tenant, "homeLoan");
}
