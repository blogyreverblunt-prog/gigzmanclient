/**
 * The catalogue of templates this codebase can render, and the URL segment
 * each one is addressed by: `/realestate/{urlSlug}/{clientSlug}/...`.
 * Premium V2 is the only surviving template — the earlier
 * premium-inventory/luxury-advisory/market-intelligence/locality-pseo
 * template-library demos were removed.
 *
 * This module used to own the *assignment* too: a hardcoded slug -> template
 * object, deleted by CD-01. It was justified on the grounds that a slug-keyed
 * map said "yes, this slug is a real-estate tenant using the template" for the
 * one real client, and did so without needing a migration.
 *
 * That justification stopped being true twice over. There are five real-estate
 * tenants, not one; and a client absent from the map did not render
 * untemplated, it **404s** (`lib/tenant.ts` `getTenantBySlug`). So onboarding a
 * client required a code edit and a deploy — which made a dashboard that
 * *creates* clients impossible to build. CD-01 moved the assignment to
 * `clients.template_key`: the row is the source of truth, and
 * `templateKeyFor()` below is the one place a stored value is checked against
 * this catalogue.
 *
 * What stays in code is this registry, because it is the set of templates the
 * components actually exist for — and because `proxy.ts` calls
 * `isTemplateUrlSlug()` on every single request. `proxy.ts` must stay
 * database-free: the functions run in `bom1` while the pooler is in
 * `ap-southeast-2`, so a lookup there would tax every page view with a
 * cross-region round trip.
 *
 * The split, in one line: **adding a template is a code change; assigning one
 * to a client is a data change.**
 */
export type TemplateKey = "premium-v2";

export interface TemplateConfig {
  key: TemplateKey;
  label: string;
  /** URL segment: `/realestate/{urlSlug}/{clientSlug}`. */
  urlSlug: string;
  /** Directory name under the reference HD pack, for traceability in comments. */
  sourceDir: string;
}

export const TEMPLATE_REGISTRY: Record<TemplateKey, TemplateConfig> = {
  "premium-v2": {
    key: "premium-v2",
    label: "Premium V2",
    urlSlug: "temp-premium-v2",
    sourceDir: "geeta-properties-premium-mixed-v2",
  },
};

const URL_SLUG_TO_KEY: Record<string, TemplateKey> = Object.fromEntries(
  Object.values(TEMPLATE_REGISTRY).map((t) => [t.urlSlug, t.key]),
) as Record<string, TemplateKey>;

/**
 * The template a tenant row is assigned, validated against the catalogue above.
 *
 * Takes the row rather than a slug because the assignment now lives on
 * `clients.template_key` and every caller already holds the row — so this
 * stays synchronous and adds no query. The parameter is a structural type on
 * purpose: `proxy.ts` imports this module, so it must not reach
 * `lib/db/schema`, not even for an erased type import.
 *
 * Fail-closed. A stored value the registry does not recognise returns
 * `undefined` exactly as a null does, so a database typo 404s a real-estate
 * tenant (`lib/tenant.ts`) rather than reaching `data-template`, which selects
 * that tenant's entire palette in `app/globals.css`.
 */
export function templateKeyFor(
  tenant: { templateKey?: string | null } | null | undefined,
): TemplateKey | undefined {
  const key = tenant?.templateKey;
  if (!key) return undefined;
  // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so stored
  // values of "constructor", "toString", "valueOf" or "__proto__" would pass
  // and be returned as a TemplateKey — leaving `data-template` set to a value
  // no palette matches and `getTenantPath` building /realestate/undefined/…
  return Object.hasOwn(TEMPLATE_REGISTRY, key) ? (key as TemplateKey) : undefined;
}

export function getTemplateConfig(key: TemplateKey): TemplateConfig {
  return TEMPLATE_REGISTRY[key];
}

/** True if `urlSlug` is a registered template URL segment (proxy.ts's cheap, DB-free check). */
export function isTemplateUrlSlug(urlSlug: string): boolean {
  // `Object.hasOwn`, not `in`, for the same reason as `templateKeyFor` above:
  // `in` walks the prototype chain, so "constructor"/"toString"/"valueOf"/
  // "__proto__" answered true and proxy.ts rewrote instead of redirecting —
  // serving a real tenant at a nonsense URL.
  return Object.hasOwn(URL_SLUG_TO_KEY, urlSlug);
}

/** The template key a URL segment refers to — used by lib/tenant.ts's DB-verified check. */
export function getTemplateKeyForUrlSlug(urlSlug: string): TemplateKey | undefined {
  // Guarded for the same reason: a bare index read returned Object.prototype
  // members, so this handed back a *function* from a signature that promises
  // `TemplateKey | undefined`. lib/tenant.ts only failed closed by accident,
  // because it compares the result against a string.
  return Object.hasOwn(URL_SLUG_TO_KEY, urlSlug) ? URL_SLUG_TO_KEY[urlSlug] : undefined;
}

/**
 * `/{vertical}/{clientSlug}` for most verticals, `/realestate/{templateUrlSlug}/
 * {clientSlug}` for a real-estate tenant — the one shared place that knows
 * this shape, so callers that build a tenant link outside of `getBasePath()`
 * (which already gets it right via the request headers) don't each
 * reimplement the branch.
 *
 * Takes the row, not `(vertical, clientSlug)`: the template segment is now
 * read off `clients.template_key`, and all three callers already hold the row.
 * A third positional `templateKey` argument was rejected — three strings whose
 * order can be transposed with no type error.
 */
export function getTenantPath(tenant: {
  vertical: string;
  slug: string;
  templateKey?: string | null;
}): string {
  if (tenant.vertical === "realestate") {
    const key = templateKeyFor(tenant);
    if (key) return `/${tenant.vertical}/${TEMPLATE_REGISTRY[key].urlSlug}/${tenant.slug}`;
  }
  return `/${tenant.vertical}/${tenant.slug}`;
}
