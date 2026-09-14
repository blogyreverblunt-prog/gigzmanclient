import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, queries } from "@/lib/db/schema";

/**
 * Read side for the cross-client lead inbox at `/leads`.
 *
 * In `lib/platform/` for the same reason `clients.ts` is: `lib/content.ts`
 * promises that every query in it is scoped by `clientId`, and these are
 * unscoped by definition — the whole point is to see every client at once.
 * Hiding the one unscoped lead query inside the module that promises there are
 * none is how the next reader ends up copying it into a tenant page.
 *
 * What stands in front of these is `requirePlatformAdmin()` in the page that
 * calls them, and nothing else. Nothing under `app/site/[tenant]/` may import
 * this file — a tenant page reading these would show one client another's
 * enquiries.
 *
 * Uncached, like the client list: an operator working a lead queue must see the
 * row as it is, not as a 300-second cache remembers it.
 */

export interface PlatformLeadRow {
  id: string;
  reference: string;
  clientSlug: string;
  clientName: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  status: string;
  leadSource: string | null;
  formName: string | null;
  serviceLabel: string | null;
  landingPage: string | null;
  /** Non-null only for leads that arrived over `/api/v1/leads`. */
  externalId: string | null;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface LeadFilters {
  clientSlug?: string | null;
  status?: string | null;
  /** Matches name, email, phone or reference. */
  search?: string | null;
  /** Only leads newer than this many days. */
  days?: number | null;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface LeadPage {
  rows: PlatformLeadRow[];
  total: number;
}

function conditions(filters: LeadFilters) {
  const list = [eq(queries.isArchived, filters.archived ?? false)];

  if (filters.clientSlug) list.push(eq(clients.slug, filters.clientSlug));

  // The enum column will not compare against a plain string through `eq`
  // without a cast, and an unrecognised value must not throw — the filter
  // arrives from a query string anyone can edit.
  if (filters.status) list.push(sql`${queries.status}::text = ${filters.status}`);

  if (filters.days && filters.days > 0) {
    list.push(gte(queries.createdAt, new Date(Date.now() - filters.days * 86_400_000)));
  }

  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    // `reference` is included because it is what an operator has in front of
    // them when a client rings up about one specific enquiry.
    list.push(
      or(
        ilike(queries.name, like),
        ilike(queries.email, like),
        ilike(queries.phone, like),
        ilike(queries.reference, like),
      )!,
    );
  }

  return and(...list);
}

export async function listLeadsForPlatform(filters: LeadFilters = {}): Promise<LeadPage> {
  const where = conditions(filters);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  // innerJoin, not leftJoin: `queries.client_id` is NOT NULL with a cascading
  // foreign key, so a lead without a client cannot exist. A leftJoin here would
  // imply otherwise and force every consumer to handle a null client name.
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: queries.id,
        reference: queries.reference,
        clientSlug: clients.slug,
        clientName: clients.displayName,
        name: queries.name,
        phone: queries.phone,
        email: queries.email,
        message: queries.message,
        status: sql<string>`${queries.status}::text`,
        leadSource: queries.leadSource,
        formName: queries.formName,
        serviceLabel: queries.serviceLabel,
        landingPage: queries.landingPage,
        externalId: queries.externalId,
        createdAt: queries.createdAt,
        lastActivityAt: queries.lastActivityAt,
      })
      .from(queries)
      .innerJoin(clients, eq(clients.id, queries.clientId))
      .where(where)
      .orderBy(desc(queries.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(queries)
      .innerJoin(clients, eq(clients.id, queries.clientId))
      .where(where),
  ]);

  return { rows, total: totals?.n ?? 0 };
}

export interface LeadCounts {
  /** Every non-archived lead, all clients. */
  total: number;
  /** Still at `new` — nobody has touched them. */
  unactioned: number;
  last24h: number;
  last7d: number;
  byStatus: Record<string, number>;
  byClient: { slug: string; name: string; count: number; newest: Date | null }[];
}

export async function leadCountsForPlatform(): Promise<LeadCounts> {
  const live = eq(queries.isArchived, false);

  const [byStatus, byClient, [windows]] = await Promise.all([
    db
      .select({ status: sql<string>`${queries.status}::text`, n: sql<number>`count(*)::int` })
      .from(queries)
      .where(live)
      .groupBy(queries.status),

    // Every client appears, including those with no leads at all — "zero leads
    // since we connected the site" is the single most useful thing this page can
    // tell an operator, and a row that is simply absent does not say it.
    db
      .select({
        slug: clients.slug,
        name: clients.displayName,
        count: sql<number>`count(${queries.id})::int`,
        newest: sql<Date | null>`max(${queries.createdAt})`,
      })
      .from(clients)
      .leftJoin(queries, and(eq(queries.clientId, clients.id), live))
      .groupBy(clients.slug, clients.displayName)
      .orderBy(clients.slug),

    db
      .select({
        total: sql<number>`count(*)::int`,
        unactioned: sql<number>`count(*) filter (where ${queries.status}::text = 'new')::int`,
        last24h: sql<number>`count(*) filter (where ${queries.createdAt} > now() - interval '24 hours')::int`,
        last7d: sql<number>`count(*) filter (where ${queries.createdAt} > now() - interval '7 days')::int`,
      })
      .from(queries)
      .where(live),
  ]);

  return {
    total: windows?.total ?? 0,
    unactioned: windows?.unactioned ?? 0,
    last24h: windows?.last24h ?? 0,
    last7d: windows?.last7d ?? 0,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    byClient: byClient.map((r) => ({
      ...r,
      newest: r.newest ? new Date(r.newest) : null,
    })),
  };
}
