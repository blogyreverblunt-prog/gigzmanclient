import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, firmSettings } from "@/lib/db/schema";
import { vastuSectorsEnabled } from "@/lib/vastu/enabled";

/**
 * Read side for the platform dashboard at `/`. Deliberately NOT in
 * lib/content.ts: that module's whole contract is that every query is scoped by
 * clientId, and a client listing is unscoped by definition. Putting it there
 * would hide the one unscoped query in the module that promises there are none,
 * and the next reader would copy it.
 *
 * What stands in front of these queries is `requirePlatformAdmin()` in the page
 * or action that calls them, and nothing else. Nothing under app/site/[tenant]/
 * may import this file.
 *
 * Uncached on purpose. The operator must see the row as it actually is, not as
 * a 300-second-old cache remembers it — and both callers are `force-dynamic`
 * pages that no cache would serve anyway.
 */

export type PlatformClient = typeof clients.$inferSelect;
export type PlatformFirmSettings = typeof firmSettings.$inferSelect;

export interface PlatformClientRow {
  id: string;
  slug: string;
  vertical: string;
  templateKey: string | null;
  displayName: string;
  customDomain: string | null;
  isActive: boolean;
  isDemo: boolean;
  features: PlatformClient["features"];
  createdAt: Date;
  /** `clients` has no `updatedAt`, so "last updated" comes from the settings row. */
  settingsUpdatedAt: Date | null;
  firmName: string | null;
}

export async function listClientsForPlatform(): Promise<PlatformClientRow[]> {
  // `leftJoin`, not `innerJoin`: a client with no `firm_settings` row must still
  // appear. After CD-03b's wizard a half-created one is exactly what an operator
  // needs to see.
  //
  // No try/catch, unlike `activeTenants()` and `sitemapClients()` next door.
  // Those swallow database errors to keep a build alive; copying that here would
  // render an empty table that reads as "you have no clients" when it means "the
  // database is unreachable" — and an operator would then create a duplicate. On
  // a gated operator page, failing loudly into the error boundary is correct.
  return db
    .select({
      id: clients.id,
      slug: clients.slug,
      vertical: clients.vertical,
      templateKey: clients.templateKey,
      displayName: clients.displayName,
      customDomain: clients.customDomain,
      isActive: clients.isActive,
      isDemo: clients.isDemo,
      features: clients.features,
      createdAt: clients.createdAt,
      settingsUpdatedAt: firmSettings.updatedAt,
      firmName: firmSettings.firmName,
    })
    .from(clients)
    .leftJoin(firmSettings, eq(firmSettings.clientId, clients.id))
    .orderBy(asc(clients.slug));
}

export async function getClientForPlatform(
  slug: string,
): Promise<{ client: PlatformClient; settings: PlatformFirmSettings | null } | null> {
  const [client] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
  if (!client) return null;

  const [settings] = await db
    .select()
    .from(firmSettings)
    .where(eq(firmSettings.clientId, client.id))
    .limit(1);

  return { client, settings: settings ?? null };
}

/**
 * Which clients currently publish the Gurugram sector vastu matrix.
 *
 * Filtered in JS through `vastuSectorsEnabled`, NOT with a SQL predicate on
 * `features->>'vastuSectors'`. jsonb is untyped, `featureEnabled` treats
 * anything that is not literally a boolean as absent and applies
 * `FEATURE_DEFAULTS`, and a SQL predicate would diverge from that on `"true"`,
 * `1` and `null` — precisely the divergence CD-02's `Object.hasOwn` guard exists
 * to prevent. Six rows; the query is free, and reusing the validated accessor is
 * the point.
 *
 * `isActive` is in the predicate because the cap this feeds is a BUILD-OUTPUT
 * cap, and a deactivated client prerenders nothing: `activeTenants()` in
 * lib/static-params.ts filters it out of every `generateStaticParams`, so it
 * costs zero of the ~3,700 routes the cap exists to ration. Counting it anyway
 * would let three switched-off rows refuse a live client outright — and the cap
 * refusal correctly says no confirmation lifts it, so the operator would be
 * stopped with no route forward and no explanation.
 *
 * One function, called by both the edit page (which renders the count in the
 * warning) and `updateClientFeatures` (which refuses with it), so the number on
 * screen and the number in the refusal cannot disagree.
 */
export async function vastuSectorTenants(): Promise<{ id: string; slug: string }[]> {
  const rows = await db
    .select({ id: clients.id, slug: clients.slug, features: clients.features })
    .from(clients)
    .where(eq(clients.isActive, true))
    .orderBy(asc(clients.slug));

  return rows.filter((row) => vastuSectorsEnabled(row)).map(({ id, slug }) => ({ id, slug }));
}
