import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import type { ClientFeatures } from "@/lib/features";

/**
 * Helpers for `generateStaticParams` on nested dynamic routes.
 *
 * Important behaviour this works around: a child segment's
 * `generateStaticParams` must return the COMPLETE param set, including the
 * `tenant` param owned by the ancestor segment. Returning only the child's
 * own param (and relying on Next to compose it with the parent's) silently
 * produced nothing — the function was called once per tenant and its results
 * discarded, so several hundred pages fell back to on-demand rendering while
 * still being reported as prerendered in the build summary.
 *
 * Every list falls back to an empty array when the database is unreachable at
 * build time, so a build never fails over this — those routes simply render
 * on demand and are cached afterwards.
 */
/**
 * A single-client deployment (a client's own domain, `TENANT_MODE=host`) has
 * no reason to prerender every other tenant's pages. `TENANT_ONLY` is a
 * comma-separated slug list that narrows the build to those clients; unset, it
 * builds all of them, which is what the shared multi-tenant deployment wants.
 */
const TENANT_ONLY = (process.env.TENANT_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * What `generateStaticParams` needs about a tenant: enough to gate on its
 * template without a second query.
 *
 * `vertical` and `templateKey` are here because two routes — `builders/[slug]`
 * and `sectors/[sector]` — gate on the template *inside*
 * `generateStaticParams`, on the object `paramsForEachTenant` hands them.
 * While the assignment lived in a slug-keyed map, `slug` was enough. Now it is
 * a column, and a projection missing it makes `templateKeyFor()` return
 * `undefined` for every tenant, so both routes return `[]` and prerender
 * nothing while the build still reports success.
 *
 * `features` is here for the same reason, one increment later, and it is the
 * second time this projection has had to widen to stop exactly that failure.
 * `home-loan/[slug]` and `home-loan/[slug]/[amount]` gate inside
 * `generateStaticParams` on the object handed to them here, so a projection
 * without `features` makes `homeLoanEnabled()` answer for the defaults rather
 * than for the tenant, both families return `[]`, and roughly 1,050 pages per
 * DSA tenant quietly stop being prerendered while the build still reports
 * success. `FeatureHost` in `lib/features.ts` requires `features` rather than
 * marking it optional precisely so that omission is a type error here instead
 * of silence there. Anything a `generateStaticParams` gate reads has to be in
 * this select.
 */
export type StaticParamTenant = {
  id: string;
  slug: string;
  vertical: string;
  templateKey: string | null;
  features: ClientFeatures;
};

/**
 * How much to prerender at build time.
 *
 * `PRERENDER=full` walks every tenant’s whole inventory. That is the right
 * trade for a long-lived site with real traffic: one slow build buys instant
 * pages for everyone afterwards.
 *
 * Anything else — the default — prerenders nothing and lets pages render on
 * demand, cached afterwards by `lib/content.ts`. This is the right trade for
 * the demo deployments this repo actually ships. A demo is shown to a handful
 * of people over a couple of days, so prerendering 4,425 pages to serve maybe
 * thirty of them cost ~70 minutes and was killed outright by Vercel’s
 * 45-minute build ceiling (BUILD_EXCEEDED_MAXIMUM_TIME, 2026-09-11).
 *
 * The decisive reason is onboarding, not build time. `proxy.ts` matches tenant
 * slugs by pattern and resolves them from the database, so with nothing
 * prerendered a newly seeded client is reachable immediately, with no deploy
 * at all — which is what makes five or six demo sites a day possible.
 * Prerendering puts a full rebuild in front of every new client.
 *
 * Rejected: prerendering a reduced slice (say the first 50 listings per
 * tenant). It halves the build but keeps a rebuild between seeding a client
 * and their site existing, which is the cost that actually hurts here.
 */
const PRERENDER_ALL = process.env.PRERENDER === "full";

export async function activeTenants(): Promise<StaticParamTenant[]> {
  // Returning nothing here is what switches the whole tree to on-demand
  // rendering: every caller of `paramsForEachTenant` iterates this list.
  if (!PRERENDER_ALL) return [];

  try {
    const rows = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        vertical: clients.vertical,
        templateKey: clients.templateKey,
        features: clients.features,
      })
      .from(clients)
      .where(eq(clients.isActive, true));
    return TENANT_ONLY.length > 0 ? rows.filter((r) => TENANT_ONLY.includes(r.slug)) : rows;
  } catch {
    return [];
  }
}

/** Builds `{ tenant, ...child }` rows from a per-tenant lookup. */
export async function paramsForEachTenant<T extends Record<string, string>>(
  rowsFor: (tenant: StaticParamTenant) => Promise<T[]>,
): Promise<({ tenant: string } & T)[]> {
  const tenants = await activeTenants();
  const out: ({ tenant: string } & T)[] = [];
  for (const tenant of tenants) {
    try {
      for (const row of await rowsFor(tenant)) out.push({ tenant: tenant.slug, ...row });
    } catch {
      // One tenant failing to enumerate must not take the whole build down.
    }
  }
  return out;
}
