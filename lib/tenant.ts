import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { tenantSlugTag } from "@/lib/cache-tags";
import { joinPath } from "@/lib/paths";
import { getTemplateKeyForUrlSlug, getTenantPath, templateKeyFor } from "@/lib/templates";

export { joinPath };

export type Tenant = typeof clients.$inferSelect;

/**
 * Resolved once per request. `cache` dedupes the lookup across every component
 * that needs the tenant, so a page with a header, footer and body costs one query.
 */
/**
 * Slug -> client row, cached across requests. This lookup runs on every
 * single request (layout, page, metadata) and is a cross-region query, so
 * leaving it uncached cost a round trip on every navigation.
 *
 * The cache is created per call rather than once at module load because
 * `unstable_cache`'s `tags` are fixed at wrap time and cannot vary by argument,
 * and this tag has to name the tenant — otherwise one client's edit would
 * expire all six. The rejected alternative was a single shared tag: it works,
 * and it makes every platform save re-query the database for every tenant on
 * the next request to each of their sites.
 *
 * `slug` MUST stay in the key parts. `unstable_cache` derives its key from the
 * key parts, the stringified callback and the callback's arguments — and this
 * inner closure takes no arguments and stringifies identically for every slug.
 * Drop it and all six tenants share one entry, which is not a slow site, it is
 * the wrong client's site.
 *
 * `revalidate: 300` is unchanged deliberately. It is now the ceiling on
 * staleness from an UNOBSERVED change, not the latency of an operator edit —
 * `lib/actions/platform-actions.ts` expires this tag on save.
 */
function lookupClientBySlug(slug: string) {
  return unstable_cache(
    async () => {
      const [row] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
      return row ?? null;
    },
    ["client-by-slug", slug],
    { revalidate: 300, tags: [tenantSlugTag(slug)] },
  )();
}

/**
 * Resolve a tenant from a URL segment instead of a request header.
 *
 * This is what makes the public site cacheable. `getTenant()` below reads
 * `headers()`, and any page that does so is forced into dynamic rendering —
 * Next then sends `no-store` and every single request re-renders on the
 * server. Taking the slug from `params` keeps the render free of dynamic
 * APIs, so public pages can be prerendered and revalidated instead.
 *
 * The header-based version is kept for the dashboard and for server actions,
 * which are per-user and dynamic by nature.
 */
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  const row = await lookupClientBySlug(slug);
  if (!row) return null;

  // An inactive tenant is off the air, not merely unlisted, and that now holds
  // for writes as well as renders. Rendered surfaces resolve through this
  // function; the mutating paths do not — they each run their own `clients`
  // query — so the same `isActive` predicate is applied at each of them:
  // `getTenant()` below (both branches), `getSessionUser()` in lib/auth.ts,
  // `login()` in lib/actions/auth-actions.ts, and both branches of
  // lib/actions/submit-query.ts. A deactivated tenant's staff holding a live
  // `gz_session` can no longer sign in, run a dashboard action, or have a lead
  // written on their behalf.
  //
  // The one surface still outside this guard is
  // `(public)/properties/loading.tsx`, which reads `getTenant()` and flushes a
  // Suspense shell with a 200 before the page body 404s — the standing soft-404
  // finding, pre-existing and still open.
  //
  // Deactivation takes effect within seconds rather than at the 300s expiry:
  // `lookupClientBySlug` above carries `tenantSlugTag(slug)` and the platform
  // actions expire it on save.
  //
  // Not a lock-out: reactivation is an operator action, never a tenant one.
  if (!row.isActive) return null;

  // Same DB-verified guard the header path applies: a real-estate client must
  // actually be assigned a template the code can render, so a wrong template
  // segment — or a null/unrecognised `template_key` — 404s rather than
  // rendering the client under foreign chrome.
  if (row.vertical === "realestate" && !templateKeyFor(row)) return null;

  return row;
});

/** Link prefix for a tenant, derived from the row rather than a header. */
/**
 * Link prefix for a tenant. Empty on a host-mode deployment, where the
 * client's own domain serves that client at the root — returning the
 * `/realestate/<template>/<slug>` prefix there would point every internal
 * link at a path that does not exist on that domain.
 */
const HOST_MODE = process.env.TENANT_MODE === "host";

export function basePathFor(tenant: Tenant): string {
  if (HOST_MODE) return "";
  return getTenantPath(tenant);
}

export const getTenant = cache(async (): Promise<Tenant | null> => {
  const h = await headers();

  const slug = h.get("x-tenant");
  if (slug) {
    const row = await lookupClientBySlug(slug);
    if (!row) return null;

    // Same guard as `getTenantBySlug` above, applied here because this is the
    // path the tenant dashboard and every Server Action resolve through: a
    // deactivated tenant must be off the air for writes, not only for renders.
    if (!row.isActive) return null;

    // proxy.ts only confirms the URL's vertical segment is a *known* vertical —
    // it never touches the database. Here is where that segment is checked
    // against the client's actual vertical, so /cafirm/<realestate-client-slug>
    // 404s instead of rendering that client under the wrong template.
    const urlVertical = h.get("x-tenant-vertical");
    if (urlVertical && urlVertical !== row.vertical) return null;

    // Realestate carries an extra `{template}` URL segment (proxy.ts); confirm
    // it's actually the template this client is assigned, the same
    // DB-verified pattern as the vertical check above — /realestate/
    // temp-locality/<a-luxury-advisory-client> should 404, not silently
    // render that client under the wrong template's chrome.
    const urlTemplateSlug = h.get("x-tenant-template-slug");
    if (urlTemplateSlug) {
      const urlTemplateKey = getTemplateKeyForUrlSlug(urlTemplateSlug);
      const clientTemplateKey = templateKeyFor(row);
      if (!urlTemplateKey || urlTemplateKey !== clientTemplateKey) return null;
    }

    return row;
  }

  const host = h.get("x-tenant-host");
  if (host) {
    // `isActive` in the predicate rather than after the read: this branch
    // `.limit(1)` with no tiebreak, so a deactivated row must not be the one
    // that wins and shadow an active tenant sharing the domain.
    const [row] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.customDomain, host), eq(clients.isActive, true)))
      .limit(1);
    return row ?? null;
  }

  return null;
});

/** Throws where a tenant is structurally required, so pages fail loudly rather than blank. */
export async function requireTenant(): Promise<Tenant> {
  const tenant = await getTenant();
  if (!tenant) throw new Error("No tenant resolved for this request");
  return tenant;
}

/**
 * Path prefix for links. Empty in host mode, `/cafirm/<slug>` in path mode,
 * so every internal href is written as a clean route and prefixed here.
 */
export const getBasePath = cache(async (): Promise<string> => {
  const h = await headers();
  return h.get("x-tenant-base") ?? "";
});

/** Convenience for server components: `await tenantPath("/services")`. */
export async function tenantPath(path: string): Promise<string> {
  return joinPath(await getBasePath(), path);
}
