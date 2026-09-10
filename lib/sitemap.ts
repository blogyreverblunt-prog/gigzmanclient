import type { MetadataRoute } from "next";
import { asc, eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, services, professionalUpdates, properties, localities } from "@/lib/db/schema";
import { sectorSlug, developerSlug } from "@/lib/register";
import { getTenantPath, templateKeyFor } from "@/lib/templates";
import { LOCATION_PAGES } from "@/lib/locations";
import { getVerticalConfig } from "@/lib/verticals";
import { LOAN_AMOUNTS, amountSlugStem } from "@/lib/home-loan/amounts";
import { homeLoanEnabled } from "@/lib/home-loan/enabled";
import { LENDERS } from "@/lib/home-loan/banks";
import { unitPairs, pairSlug } from "@/lib/calculators/area-units";
import { DIRECTIONS, ROOMS, VASTU_CONTEXTS } from "@/lib/vastu";
import { SECTORS, PLOT_SIZES, PROPERTY_CONTEXTS, sectorAspectSlugs } from "@/lib/vastu/sectors";
import { vastuSectorsEnabled } from "@/lib/vastu/enabled";
import { MAP_AREAS } from "@/lib/maps/areas";

type Client = typeof clients.$inferSelect;
type Entries = MetadataRoute.Sitemap;

/**
 * The sitemap is split into one file per content family, indexed from
 * /sitemap.xml.
 *
 * A single file was valid — 4,770 URLs is well inside Google's 50,000 limit —
 * but it made the site unreadable in Search Console. The programmatic vastu
 * set alone is 83% of the URLs, so a coverage problem on the pages that
 * actually earn business (properties, localities, market updates) was a
 * rounding error inside one blob. Split by family, each one reports its own
 * indexed/excluded counts, and the pSEO families can be diagnosed — or
 * withdrawn — without touching the rest.
 *
 * Ordered widest-value first; that is also the order the index lists them in.
 */
export const SITEMAP_FAMILIES = [
  { id: "core", label: "Static pages, hubs and legal" },
  { id: "properties", label: "Property listings" },
  { id: "register", label: "Sector and developer pages" },
  { id: "localities", label: "Corridors and rental-yield pages" },
  { id: "updates", label: "Market updates" },
  { id: "services", label: "Service pages" },
  { id: "maps", label: "Gurugram plot maps" },
  { id: "home-loan", label: "Home-loan amounts and lenders" },
  { id: "area-converter", label: "Land-area conversions" },
  { id: "vastu", label: "Vastu by direction, room and plot" },
  { id: "vastu-sectors", label: "Vastu by Gurugram sector" },
] as const;

export type SitemapFamilyId = (typeof SITEMAP_FAMILIES)[number]["id"];

export function isSitemapFamily(value: string): value is SitemapFamilyId {
  return SITEMAP_FAMILIES.some((f) => f.id === value);
}

/**
 * Clients this deployment is actually serving.
 *
 * Narrowed by `TENANT_ONLY` exactly as `lib/static-params.ts` narrows the
 * build. Without it a client's own domain would advertise every other
 * tenant's URLs in its sitemap — pages that, in host mode, do not resolve on
 * that domain at all.
 */
const TENANT_ONLY = (process.env.TENANT_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function sitemapClients(): Promise<Client[]> {
  try {
    // `ORDER BY slug`: without it the rows follow physical heap order, so every
    // write to `clients` — routine now that the platform dashboard edits them —
    // reshuffles sitemap output. The URL set is unaffected either way; what this
    // buys is that a sitemap diff means something.
    const rows = await db
      .select()
      .from(clients)
      .where(eq(clients.isActive, true))
      .orderBy(asc(clients.slug));
    // A realestate row whose `template_key` is null or unrecognised has no
    // reachable URL — `getTenantBySlug` 404s it, and `getTenantPath` falls back
    // to the two-segment `/realestate/<slug>` shape that `proxy.ts` bounces to
    // `/`. Listing it would publish a sitemap full of URLs that redirect, which
    // is an indexing liability rather than a cosmetic flaw.
    //
    // Unreachable while the template map was hardcoded in `lib/templates`;
    // reachable since CD-01 moved the assignment onto the row, and routine now
    // that CD-03b's wizard can leave a client half-configured mid-creation.
    // Filtered here rather than in the callers so every family inherits it.
    const routable = rows.filter((r) => r.vertical !== "realestate" || templateKeyFor(r) !== undefined);
    return TENANT_ONLY.length > 0 ? routable.filter((r) => TENANT_ONLY.includes(r.slug)) : routable;
  } catch {
    return [];
  }
}

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const HOST_MODE = process.env.TENANT_MODE === "host";

/**
 * Absolute prefix for a client's pages.
 *
 * In host mode the deployment serves exactly one client at its own origin,
 * and that origin — `NEXT_PUBLIC_SITE_URL` — is the canonical one. It is
 * deliberately preferred over `clients.custom_domain` here: that column
 * records which host *resolves* to the tenant, not which host is canonical,
 * and the two differ the moment a site redirects apex to www. Reading the
 * column instead put `https://highproperties.in/...` in every sitemap entry
 * while the site 308s all of it to `https://www.highproperties.in/...`, so
 * every submitted URL was a redirect.
 *
 * The shared multi-tenant deployment still needs the column: it serves many
 * clients from one origin, so each one's own domain (or its path prefix) is
 * the only way to address it.
 */
export function prefixFor(client: Client): string {
  if (HOST_MODE) return siteOrigin();
  return client.customDomain
    ? `https://${client.customDomain}`
    : `${siteOrigin()}${getTenantPath(client)}`;
}

/**
 * `lastModified` is deliberately absent from every config-generated family
 * below, and present only where a row carries a real `updatedAt`.
 *
 * The previous sitemap stamped `new Date()` on all 4,770 URLs, so every fetch
 * claimed the entire site had changed that second. Google's guidance is that
 * a lastmod it cannot trust is one it stops reading; no value at all is
 * treated better than a value that is always "now".
 */

function coreEntries(client: Client, prefix: string): Entries {
  const vertical = getVerticalConfig(client.vertical);
  const entries: Entries = vertical.sitemapPaths.map((entry) => ({
    url: `${prefix}${entry.path}`,
    priority: entry.priority,
  }));

  // Location landing pages are a CA-specific content set (lib/locations.ts);
  // real estate's equivalent local-SEO surface is `localities`.
  if (client.vertical === "cafirm") {
    for (const location of LOCATION_PAGES) {
      entries.push({ url: `${prefix}/${location.slug}`, priority: 0.7 });
    }
  }

  if (client.vertical === "realestate") {
    entries.push(
      { url: `${prefix}/area-converter`, priority: 0.6 },
      { url: `${prefix}/rental-yield`, priority: 0.7 },
      { url: `${prefix}/vastu`, priority: 0.7 },
      { url: `${prefix}/maps/gurgaon`, priority: 0.7 },
    );
    if (homeLoanEnabled(client)) {
      entries.push({ url: `${prefix}/home-loan`, priority: 0.7 });
    }
    if (vastuSectorsEnabled(client)) {
      entries.push({ url: `${prefix}/vastu/gurugram`, priority: 0.6 });
    }
  }

  return entries;
}

function mapEntries(client: Client, prefix: string): Entries {
  if (client.vertical !== "realestate") return [];
  return MAP_AREAS.map((area) => ({
    url: `${prefix}/maps/gurgaon/${area.slug}`,
    priority: 0.6,
  }));
}

function homeLoanEntries(client: Client, prefix: string): Entries {
  // Home-loan pages come from static config rather than a table, so none of
  // the row queries discover them — they are enumerated explicitly.
  //
  // Vertical and template guarded exactly as `registerEntries` and
  // `vastuSectorEntries` below, and for the same reason: the routes live under
  // the premium-v2 real-estate template only. Without it this function
  // disagreed with `coreEntries` above about a single family on a single row —
  // that one gates the `/home-loan` hub on the vertical, while nothing gated
  // the ~1,050 children, so a non-real-estate row carrying the flag would have
  // advertised a thousand URLs that 404 while withholding their parent.
  if (client.vertical !== "realestate" || templateKeyFor(client) !== "premium-v2") return [];
  if (!homeLoanEnabled(client)) return [];
  const entries: Entries = [];

  for (const amount of LOAN_AMOUNTS) {
    entries.push({ url: `${prefix}/home-loan/${amount.slug}`, priority: 0.6 });
  }

  for (const lender of LENDERS) {
    entries.push({ url: `${prefix}/home-loan/${lender.slug}`, priority: 0.6 });
    // The lender x amount matrix sits at a lower priority than either parent
    // — it is the widest and least differentiated layer.
    for (const amount of LOAN_AMOUNTS) {
      entries.push({
        url: `${prefix}/home-loan/${lender.slug}/${amountSlugStem(amount)}`,
        priority: 0.4,
      });
    }
  }

  return entries;
}

function areaConverterEntries(client: Client, prefix: string): Entries {
  if (client.vertical !== "realestate") return [];
  return unitPairs().map((pair) => ({
    url: `${prefix}/area-converter/${pairSlug(pair.from, pair.to)}`,
    priority: 0.4,
  }));
}

function vastuEntries(client: Client, prefix: string): Entries {
  if (client.vertical !== "realestate") return [];
  const entries: Entries = [];

  for (const direction of DIRECTIONS) {
    for (const context of VASTU_CONTEXTS) {
      entries.push({ url: `${prefix}/vastu/${direction.slug}-facing-${context.slug}`, priority: 0.5 });
    }
  }

  for (const room of ROOMS) {
    entries.push({ url: `${prefix}/vastu/${room.slug}-vastu`, priority: 0.5 });
    for (const direction of DIRECTIONS) {
      entries.push({ url: `${prefix}/vastu/${room.slug}-in-${direction.slug}-vastu`, priority: 0.4 });
    }
  }

  for (const direction of DIRECTIONS) {
    for (const size of PLOT_SIZES) {
      entries.push({ url: `${prefix}/vastu/${size}-plot-${direction.slug}-facing-vastu`, priority: 0.4 });
    }
    for (const context of PROPERTY_CONTEXTS) {
      entries.push({ url: `${prefix}/vastu/${context.slug}-${direction.slug}-facing-vastu`, priority: 0.4 });
    }
  }

  return entries;
}

function vastuSectorEntries(client: Client, prefix: string): Entries {
  // Gated on the same allowlist the pages use — listing sector URLs for a
  // client whose routes 404 would be a sitemap full of dead links.
  if (client.vertical !== "realestate" || !vastuSectorsEnabled(client)) return [];

  const aspects = sectorAspectSlugs(
    DIRECTIONS.map((d) => d.slug),
    ROOMS.map((r) => r.slug),
  );
  const entries: Entries = [];

  for (const sector of SECTORS) {
    entries.push({ url: `${prefix}/vastu/gurugram/${sector.slug}`, priority: 0.5 });
    for (const aspect of aspects) {
      entries.push({ url: `${prefix}/vastu/gurugram/${sector.slug}/${aspect}`, priority: 0.3 });
    }
  }

  return entries;
}

async function propertyEntries(client: Client, prefix: string): Promise<Entries> {
  const rows = await db
    .select()
    .from(properties)
    .where(and(eq(properties.clientId, client.id), eq(properties.isActive, true)));
  return rows.map((property) => ({
    url: `${prefix}/properties/${property.slug}`,
    lastModified: property.updatedAt,
    priority: property.isFeatured ? 0.8 : 0.7,
  }));
}

/**
 * One page per sector and per developer on the register. Both are cuts of the
 * same inventory, so they share a family — and a coverage problem in one is
 * almost always a problem in the other.
 *
 * Mirrors the two routes' `generateStaticParams`: developers holding a single
 * project get no page, because it would only restate the listing it links to.
 */
async function registerEntries(client: Client, prefix: string): Promise<Entries> {
  // The routes live under the premium-v2 real-estate template only; listing
  // them for any other tenant advertises URLs that 404 on that tenant's site.
  if (client.vertical !== "realestate" || templateKeyFor(client) !== "premium-v2") return [];

  const rows = await db
    .select()
    .from(properties)
    .where(and(eq(properties.clientId, client.id), eq(properties.isActive, true)));

  const latest = (list: typeof rows) =>
    list.reduce<Date | undefined>((a, r) => (!a || r.updatedAt > a ? r.updatedAt : a), undefined);

  const bySector = new Map<string, typeof rows>();
  const byDeveloper = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.sector) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
    if (r.developer) byDeveloper.set(r.developer, [...(byDeveloper.get(r.developer) ?? []), r]);
  }

  const entries: Entries = [
    { url: `${prefix}/sectors`, lastModified: latest(rows), priority: 0.7 },
    { url: `${prefix}/builders`, lastModified: latest(rows), priority: 0.7 },
  ];
  for (const [sector, list] of bySector) {
    entries.push({
      url: `${prefix}/sectors/${sectorSlug(sector)}`,
      lastModified: latest(list),
      priority: 0.6,
    });
  }
  for (const [developer, list] of byDeveloper) {
    if (list.length < 2) continue;
    entries.push({
      url: `${prefix}/builders/${developerSlug(developer)}`,
      lastModified: latest(list),
      priority: 0.6,
    });
  }
  return entries;
}

async function localityEntries(client: Client, prefix: string): Promise<Entries> {
  const rows = await db
    .select()
    .from(localities)
    .where(and(eq(localities.clientId, client.id), eq(localities.isPublished, true)));

  const entries: Entries = [];
  for (const locality of rows) {
    entries.push({
      url: `${prefix}/localities/${locality.slug}`,
      lastModified: locality.updatedAt,
      priority: 0.6,
    });
    if (client.vertical === "realestate") {
      entries.push({
        url: `${prefix}/rental-yield/${locality.slug}`,
        lastModified: locality.updatedAt,
        priority: 0.6,
      });
    }
  }
  return entries;
}

async function updateEntries(client: Client, prefix: string): Promise<Entries> {
  const rows = await db
    .select()
    .from(professionalUpdates)
    .where(
      and(
        eq(professionalUpdates.clientId, client.id),
        sql`${professionalUpdates.status} IN ('published','outdated')`,
      ),
    );
  return rows.map((update) => ({
    url: `${prefix}/updates/${update.slug}`,
    lastModified: update.updatedAt,
    priority: 0.6,
  }));
}

async function serviceEntries(client: Client, prefix: string): Promise<Entries> {
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.clientId, client.id), eq(services.isActive, true)));
  return rows.map((service) => ({
    url: `${prefix}/services/${service.slug}`,
    lastModified: service.updatedAt,
    priority: 0.8,
  }));
}

/** Every URL in one family, across every client this deployment serves. */
export async function entriesForFamily(family: SitemapFamilyId): Promise<Entries> {
  const clientRows = await sitemapClients();
  const out: Entries = [];

  for (const client of clientRows) {
    const prefix = prefixFor(client);
    switch (family) {
      case "core":
        out.push(...coreEntries(client, prefix));
        break;
      case "maps":
        out.push(...mapEntries(client, prefix));
        break;
      case "home-loan":
        out.push(...homeLoanEntries(client, prefix));
        break;
      case "area-converter":
        out.push(...areaConverterEntries(client, prefix));
        break;
      case "vastu":
        out.push(...vastuEntries(client, prefix));
        break;
      case "vastu-sectors":
        out.push(...vastuSectorEntries(client, prefix));
        break;
      case "properties":
        out.push(...(await propertyEntries(client, prefix)));
        break;
      case "register":
        out.push(...(await registerEntries(client, prefix)));
        break;
      case "localities":
        out.push(...(await localityEntries(client, prefix)));
        break;
      case "updates":
        out.push(...(await updateEntries(client, prefix)));
        break;
      case "services":
        out.push(...(await serviceEntries(client, prefix)));
        break;
    }
  }

  return out;
}
