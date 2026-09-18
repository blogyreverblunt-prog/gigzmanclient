import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  firmSettings,
  services,
  complianceEvents,
  professionalUpdates,
  legalPages,
  calculators,
  teamMembers,
  properties,
  propertyImages,
  localities,
} from "@/lib/db/schema";
import { todayInIst } from "@/lib/format";
import { tenantDataTag } from "@/lib/cache-tags";

/**
 * Read-side data access for the public site. Every function is scoped by
 * `clientId`.
 *
 * Two caching layers, and they do different jobs:
 *  - React `cache` dedupes repeated calls WITHIN one request.
 *  - `unstable_cache` (via `cached` below) persists ACROSS requests, which is
 *    the one that matters here: functions run in bom1 while the Supabase
 *    pooler is in ap-southeast-2, so every uncached query pays a cross-region
 *    round trip. A page making a dozen of those is why pages took seconds.
 *
 * `REVALIDATE_SECONDS` is how long an UNOBSERVED change may go unnoticed. It is
 * not the latency of a dashboard edit: the clientId-scoped reads below carry
 * `tenantDataTag(clientId)`, and both write surfaces expire it on save — the
 * platform actions in lib/actions/platform-actions.ts and, since CD-03c, the
 * tenant dashboard's own actions in lib/actions/dashboard-actions.ts. An edit
 * from either is live on the next request.
 *
 * Until CD-03c the second half of that was false: those actions ended in
 * `revalidatePath("/site")` and `revalidatePath("/site/properties")`, paths
 * that are not real rendered routes and so matched no tag at all, while the
 * dashboard reported "Saved.". If a future edit here reintroduces a
 * path-based call, check it against a resolved pathname or a route pattern
 * plus a `type` — Next does not warn when a path matches nothing.
 */
const REVALIDATE_SECONDS = 300;

/** Cross-request cache. Key parts must include every argument that changes the result. */
function cached<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  keyParts: string[],
) {
  return unstable_cache(fn, keyParts, { revalidate: REVALIDATE_SECONDS });
}

/**
 * Cross-request cache for a read scoped to one client, tagged so a platform edit
 * can expire exactly that client's entries.
 *
 * Same shape and same reason as `lookupClientBySlug` in lib/tenant.ts: the cache
 * is built per call because `unstable_cache`'s tags are fixed at wrap time, and
 * `clientId` is in the key parts because the inner closure takes no arguments
 * and stringifies identically for every tenant. Drop it and all six tenants
 * share one entry — one client's rows served on another client's site.
 *
 * A tagged entry also tags the render that read it: `unstable_cache` pushes its
 * tags onto the enclosing render's work-unit store, so the ISR entry for every
 * page under app/site/[tenant]/(public)/ inherits this tag through the layout's
 * `getFirmSettings` call. One `updateTag` therefore expires this tenant's cached
 * rows AND its prerendered HTML, and no other tenant's.
 */
function cachedForClient<T>(keyPart: string, clientId: string, fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, [keyPart, clientId], {
    revalidate: REVALIDATE_SECONDS,
    tags: [tenantDataTag(clientId)],
  })();
}

export const getFirmSettings = cache(async (clientId: string) =>
  cachedForClient("firm-settings", clientId, async () => {
    const [row] = await db
      .select()
      .from(firmSettings)
      .where(eq(firmSettings.clientId, clientId))
      .limit(1);
    return row ?? null;
  }),
);

/**
 * `getTeam`, `getCalculators` and `getLocalities` carry the tenant tag even
 * though nothing in CD-03a writes those tables. That is not scaffolding: the
 * tag IS called, by every platform save. It is deliberate over-invalidation —
 * one extra cross-region query per tenant on the first request after a rare
 * operator edit, in exchange for a tag that means "this tenant's cached
 * read-side data" rather than "two particular functions".
 */
export const getTeam = cache(async (clientId: string) =>
  cachedForClient("team", clientId, async () =>
    db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.clientId, clientId), eq(teamMembers.isActive, true)))
      .orderBy(asc(teamMembers.sortOrder)),
  ),
);

export const getServices = cache(async (clientId: string) =>
  db
    .select()
    .from(services)
    .where(and(eq(services.clientId, clientId), eq(services.isActive, true)))
    .orderBy(asc(services.sortOrder)),
);

export const getAllServices = cache(async (clientId: string) =>
  db.select().from(services).where(eq(services.clientId, clientId)).orderBy(asc(services.sortOrder)),
);

export const getService = cache(async (clientId: string, slug: string) => {
  const [row] = await db
    .select()
    .from(services)
    .where(
      and(eq(services.clientId, clientId), eq(services.slug, slug), eq(services.isActive, true)),
    )
    .limit(1);
  return row ?? null;
});

export const getUpcomingCompliance = cache(async (clientId: string) =>
  db
    .select()
    .from(complianceEvents)
    .where(
      and(
        eq(complianceEvents.clientId, clientId),
        eq(complianceEvents.isPublished, true),
        gte(sql`COALESCE(${complianceEvents.extendedDueDate}, ${complianceEvents.dueDate})`, todayInIst()),
      ),
    )
    .orderBy(
      asc(sql`COALESCE(${complianceEvents.extendedDueDate}, ${complianceEvents.dueDate})`),
    ),
);

export const getPastCompliance = cache(async (clientId: string) =>
  db
    .select()
    .from(complianceEvents)
    .where(
      and(
        eq(complianceEvents.clientId, clientId),
        eq(complianceEvents.isPublished, true),
        sql`COALESCE(${complianceEvents.extendedDueDate}, ${complianceEvents.dueDate}) < ${todayInIst()}`,
      ),
    )
    .orderBy(
      desc(sql`COALESCE(${complianceEvents.extendedDueDate}, ${complianceEvents.dueDate})`),
    )
    .limit(20),
);

export const getAllCompliance = cache(async (clientId: string) =>
  db
    .select()
    .from(complianceEvents)
    .where(eq(complianceEvents.clientId, clientId))
    .orderBy(desc(complianceEvents.dueDate)),
);

/** The single deadline shown in the announcement bar and mobile popup. */
export const getNextDeadline = cache(async (clientId: string) => {
  const upcoming = await getUpcomingCompliance(clientId);
  return upcoming[0] ?? null;
});

export const getPublishedUpdates = cache(async (clientId: string) =>
  db
    .select()
    .from(professionalUpdates)
    .where(
      and(
        eq(professionalUpdates.clientId, clientId),
        sql`${professionalUpdates.status} IN ('published', 'outdated')`,
      ),
    )
    .orderBy(desc(professionalUpdates.publishedAt)),
);

export const getAllUpdates = cache(async (clientId: string) =>
  db
    .select()
    .from(professionalUpdates)
    .where(eq(professionalUpdates.clientId, clientId))
    .orderBy(desc(professionalUpdates.updatedAt)),
);

export const getUpdate = cache(async (clientId: string, slug: string) => {
  const [row] = await db
    .select()
    .from(professionalUpdates)
    .where(and(eq(professionalUpdates.clientId, clientId), eq(professionalUpdates.slug, slug)))
    .limit(1);
  return row ?? null;
});

/**
 * Slugs only, for `generateStaticParams`. Deliberately not `getLegalPage` in a
 * loop: prerendering needs every slug a tenant has and none of the bodies,
 * which are the large column on this table.
 */
export const getLegalPageSlugs = cache(async (clientId: string) =>
  db
    .select({ slug: legalPages.slug })
    .from(legalPages)
    .where(eq(legalPages.clientId, clientId)),
);

export const getLegalPage = cache(async (clientId: string, slug: string) => {
  const [row] = await db
    .select()
    .from(legalPages)
    .where(and(eq(legalPages.clientId, clientId), eq(legalPages.slug, slug)))
    .limit(1);
  return row ?? null;
});

export const getCalculators = cache(async (clientId: string) =>
  cachedForClient("calculators", clientId, async () =>
    db
      .select()
      .from(calculators)
      .where(eq(calculators.clientId, clientId))
      .orderBy(asc(calculators.sortOrder)),
  ),
);

export const getCalculator = cache(async (clientId: string, key: string) => {
  const [row] = await db
    .select()
    .from(calculators)
    .where(and(eq(calculators.clientId, clientId), eq(calculators.key, key)))
    .limit(1);
  return row ?? null;
});

// ───────────────────────────────────────────────────────── real-estate vertical

export interface PropertyFilters {
  propertyType?: string;
  purpose?: "buy" | "rent";
  status?: string;
  locality?: string;
  minBeds?: number;
  maxPrice?: number;
  /** Free-text match against title, locality, sector and corridor. */
  search?: string;
  /**
   * Cap the rows fetched, applied as SQL `LIMIT` rather than by slicing the
   * result.
   *
   * The difference is the whole point. A caller wanting four "similar
   * properties" in Gurugram was fetching 678 full rows — 1.6 MB over the wire,
   * every column including `description`, `amenities` and `specs` — and then
   * keeping four. Across a full prerender that was roughly 1.2 GB of egress
   * per build from one call site, against a database that is 32 MB in total,
   * and it is what put the Supabase free tier 623% over quota.
   *
   * Only pass this where the caller wants the top N in the default order. A
   * filtered listing page that paginates must not use it, or page two is
   * silently empty.
   */
  limit?: number;
}

/**
 * Not `cache()`-wrapped: filter combinations are effectively unbounded (query
 * string driven), so caching every distinct combination for the life of the
 * request would grow unbounded instead of collapsing repeats the way the
 * other cached lookups do.
 */
export async function getProperties(clientId: string, filters: PropertyFilters = {}) {
  const conditions = [eq(properties.clientId, clientId), eq(properties.isActive, true)];

  if (filters.propertyType) conditions.push(eq(properties.propertyType, filters.propertyType));
  if (filters.purpose) conditions.push(eq(properties.purpose, filters.purpose));
  if (filters.status) conditions.push(eq(properties.status, filters.status as typeof properties.$inferSelect.status));
  if (filters.locality) conditions.push(eq(properties.locality, filters.locality));
  if (filters.minBeds !== undefined) conditions.push(gte(properties.beds, filters.minBeds));
  if (filters.maxPrice !== undefined) conditions.push(sql`${properties.price} <= ${filters.maxPrice}`);
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      sql`(${properties.title} ILIKE ${term} OR ${properties.locality} ILIKE ${term} OR ${properties.sector} ILIKE ${term} OR ${properties.corridor} ILIKE ${term})`,
    );
  }

  const query = db
    .select()
    .from(properties)
    .where(and(...conditions))
    .orderBy(desc(properties.isFeatured), asc(properties.sortOrder));

  return filters.limit === undefined ? query : query.limit(filters.limit);
}

export const getFeaturedProperties = cache(async (clientId: string, limit = 6) =>
  db
    .select()
    .from(properties)
    .where(and(eq(properties.clientId, clientId), eq(properties.isActive, true)))
    .orderBy(desc(properties.isFeatured), asc(properties.sortOrder))
    .limit(limit),
);

export const getProperty = cache(async (clientId: string, slug: string) => {
  const [row] = await db
    .select()
    .from(properties)
    .where(
      and(eq(properties.clientId, clientId), eq(properties.slug, slug), eq(properties.isActive, true)),
    )
    .limit(1);
  return row ?? null;
});

export const getAllProperties = cache(async (clientId: string) =>
  db
    .select()
    .from(properties)
    .where(eq(properties.clientId, clientId))
    .orderBy(desc(properties.isFeatured), asc(properties.sortOrder)),
);

/**
 * All images for many properties in ONE query.
 *
 * Callers used to map over a property list awaiting `getPropertyImages` per
 * row — twelve round trips on the homepage alone, each crossing regions.
 * Returns a map keyed by propertyId so call sites keep the same shape.
 *
 * Keeps the untagged `cached()` helper, and cannot use `cachedForClient`: it is
 * keyed by property ids and never receives a `clientId`, so it has nothing to
 * name a tenant tag with. Nothing writes property images in CD-03a, so no
 * behaviour is wrong today — but whoever adds a property-image write path
 * should know that `tenantDataTag` does not reach this entry. Inventing a
 * `clientId` parameter here would change twelve call sites for no behaviour
 * this increment needs.
 */
export const getPropertyImagesFor = cache(
  cached(async (propertyIds: string[]) => {
    if (propertyIds.length === 0) return {} as Record<string, typeof propertyImages.$inferSelect[]>;
    const rows = await db
      .select()
      .from(propertyImages)
      .where(inArray(propertyImages.propertyId, propertyIds))
      .orderBy(desc(propertyImages.isPrimary), asc(propertyImages.sortOrder));

    const grouped: Record<string, typeof propertyImages.$inferSelect[]> = {};
    for (const row of rows) {
      (grouped[row.propertyId] ??= []).push(row);
    }
    return grouped;
  }, ["property-images-batch"]),
);

export const getPropertyImages = cache(async (propertyId: string) =>
  db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId))
    .orderBy(desc(propertyImages.isPrimary), asc(propertyImages.sortOrder)),
);

/** Distinct locality values actually in use, for the filter control. */
export const getPropertyLocalityFacets = cache(async (clientId: string) => {
  const rows = await db
    .selectDistinct({ locality: properties.locality })
    .from(properties)
    .where(and(eq(properties.clientId, clientId), eq(properties.isActive, true)));
  return rows.map((r) => r.locality).filter((v): v is string => Boolean(v));
});

/**
 * Sectors this client actually holds inventory in, most-stocked first.
 *
 * Feeds the sector discovery links and the sector resolution in the locality
 * search box. Counted in SQL rather than derived on the client because the
 * localities page ships no listing rows of its own — pulling ~1000 rows over
 * to count them would undo the payload trimming in `withStats`.
 */
export const getPropertySectorFacets = cache(async (clientId: string) =>
  cachedForClient("property-sector-facets", clientId, async () => {
    const rows = await db
      .select({ sector: properties.sector, count: sql<number>`count(*)::int` })
      .from(properties)
      .where(and(eq(properties.clientId, clientId), eq(properties.isActive, true)))
      .groupBy(properties.sector)
      .orderBy(desc(sql`count(*)`), asc(properties.sector));
    return rows
      .filter((row): row is { sector: string; count: number } => Boolean(row.sector))
      .map((row) => ({ sector: row.sector, count: row.count }));
  }),
);

export const getLocalities = cache(async (clientId: string) =>
  cachedForClient("localities", clientId, async () =>
    db
      .select()
      .from(localities)
      .where(and(eq(localities.clientId, clientId), eq(localities.isPublished, true)))
      .orderBy(asc(localities.sortOrder)),
  ),
);

export const getAllLocalities = cache(async (clientId: string) =>
  db.select().from(localities).where(eq(localities.clientId, clientId)).orderBy(asc(localities.sortOrder)),
);

export const getLocality = cache(async (clientId: string, slug: string) => {
  const [row] = await db
    .select()
    .from(localities)
    .where(
      and(eq(localities.clientId, clientId), eq(localities.slug, slug), eq(localities.isPublished, true)),
    )
    .limit(1);
  return row ?? null;
});
