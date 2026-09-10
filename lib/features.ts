/**
 * Per-client feature gates, and the single accessor every gate reads through.
 *
 * These five flags lived as hardcoded Set<string> allowlists in four files
 * until CD-02. They are row data now so a dashboard can toggle them without a
 * deploy. What did NOT change: the accessors are still synchronous, because
 * they are called from generateStaticParams, from lib/sitemap.ts, and inline
 * in JSX. Making any of them async breaks the build.
 *
 * This module imports nothing on purpose. It is reached from `lib/db/schema.ts`
 * (type-only), from the three gate modules, and from `lib/static-params.ts`;
 * a database import here would follow the accessor into a client bundle.
 */
export type ClientFeatures = {
  propertyMap?: boolean;
  propertyManagementSection?: boolean;
  propertyManagementPage?: boolean;
  vastuSectors?: boolean;
  homeLoan?: boolean;
};

export type FeatureKey = keyof ClientFeatures;

/**
 * What an absent key means. NOT uniform, and that asymmetry is inherited, not
 * invented: it is exactly what each helper's old `if (!clientSlug) return …`
 * guard already did.
 *
 * `propertyMap` is opt-OUT — four of five tenants have it on — so its default
 * is `true` and a `{}` tenant gets the map. The other four are opt-IN: a
 * section with another client's branding baked into the artwork, a page family
 * that asserts a DSA relationship, and a 3,700-route matrix that has already
 * failed a deploy are all things a new tenant must ask for, never inherit.
 */
export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  propertyMap: true,
  propertyManagementSection: false,
  propertyManagementPage: false,
  vastuSectors: false,
  homeLoan: false,
};

/**
 * Anything carrying a resolved `features` value — the `clients` row, or the
 * build-time projection in `lib/static-params.ts`.
 *
 * `features` is REQUIRED, not optional, and that is load-bearing. Typed
 * `features?: ClientFeatures`, a `StaticParamTenant` that had not been widened
 * would satisfy this structurally, `featureEnabled` would silently return the
 * default for every tenant, and the home-loan generateStaticParams gates would
 * return [] and prerender nothing while the build reported success. Required,
 * they fail to typecheck instead. Do not relax this.
 */
export type FeatureHost = { features: ClientFeatures };

export function featureEnabled(
  host: FeatureHost | null | undefined,
  key: FeatureKey,
): boolean {
  const f = host?.features;
  // `'null'::jsonb` is a valid NOT NULL value and `typeof null === "object"`,
  // so the falsy check has to come first.
  if (!f || typeof f !== "object") return FEATURE_DEFAULTS[key];
  // `Object.hasOwn` rather than `in` / a bare index read: the same
  // prototype-chain defect CD-01's Amendment 1 closed three times in
  // `lib/templates/index.ts`. Harmonised in the correct direction.
  const raw = Object.hasOwn(f, key) ? (f as Record<string, unknown>)[key] : undefined;
  // jsonb is untyped at the database level. Anything that is not literally a
  // boolean is treated as absent rather than coerced.
  return typeof raw === "boolean" ? raw : FEATURE_DEFAULTS[key];
}
