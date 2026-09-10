/**
 * Hostname -> tenant slug, for deployments running in host mode
 * (`TENANT_MODE=host`), where one client's own domain serves that client's
 * site at the root: highproperties.in/properties, not
 * highproperties.in/realestate/temp-premium-v2/high-properties/properties.
 *
 * This is a static map rather than a `clients.customDomain` lookup — but not,
 * as this comment used to claim, because the resolution runs somewhere that
 * *cannot* reach the database. It can: Next 16 runs `proxy.ts` on Node, as
 * `proxy.ts`'s own header comment says. The real reason is that it *must not*.
 * `proxy.ts` runs on every single request, the functions run in `bom1` and the
 * pooler is in `ap-southeast-2`, so a lookup here would tax every page view
 * with a cross-region round trip. `docs/client-dashboard-brief.md` §11 lists
 * adding a database read to `proxy.ts` as a decision no agent may make alone.
 *
 * What this map actually is: a per-deployment convenience. A host-mode
 * deployment serves exactly one client, so `PRIMARY_HOST_TENANT`
 * (`PRIMARY_TENANT_SLUG`) is the real mechanism — every hostname that reaches
 * the deployment, including its preview `*.vercel.app` one, resolves through
 * that fallback rather than through an entry here. Without it set, an unmapped
 * hostname resolves to no tenant and every path 404s.
 *
 * Where `clients.custom_domain` really stands, since the two are easy to
 * confuse:
 *
 * - It is the source of truth for *which host resolves to a tenant* — read by
 *   `lib/tenant.ts`'s host fallback and by `lib/actions/submit-query.ts`.
 * - In **path mode only** it is the absolute prefix `lib/sitemap.ts`
 *   `prefixFor()` uses.
 * - It is deliberately **not** the canonical origin in host mode:
 *   `lib/sitemap.ts` `prefixFor()` and `lib/og.ts` `originFor()` both prefer
 *   `NEXT_PUBLIC_SITE_URL` there, each with its reason written out in place.
 *
 * So this map and that column answer different questions, and neither is a
 * copy of the other.
 */
export const HOST_TENANT_MAP: Record<string, string> = {
  "highproperties.in": "high-properties",
  "www.highproperties.in": "high-properties",
};

/**
 * Which tenant an unmapped hostname resolves to on a host-mode deployment.
 * Set per deployment; a host-mode deployment serves exactly one client, so
 * falling back to that client is correct rather than a guess.
 */
export const PRIMARY_HOST_TENANT = process.env.PRIMARY_TENANT_SLUG || "";

export function tenantSlugForHost(host: string): string | null {
  const clean = host.split(":")[0].toLowerCase();
  // `Object.hasOwn`, not a bare index: `HOST_TENANT_MAP` is a plain object, so
  // `Host: constructor` returned Object's constructor *function* from a
  // signature that promises `string | null` — and, because `??` catches only
  // null and undefined, that request also skipped the `PRIMARY_HOST_TENANT`
  // fallback every other unmapped host receives. `__proto__` returned
  // `Object.prototype` the same way. (`toString` and `hasOwnProperty` escaped
  // only because `clean` is lowercased first.) Third instance of the defect
  // CD-01's Amendment 1 closed in lib/templates/index.ts; same fix.
  if (Object.hasOwn(HOST_TENANT_MAP, clean)) return HOST_TENANT_MAP[clean];
  return PRIMARY_HOST_TENANT || null;
}
