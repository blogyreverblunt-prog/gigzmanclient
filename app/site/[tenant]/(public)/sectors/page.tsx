import { notFound } from "next/navigation";
import RegisterIndexV2, { type IndexEntry } from "@/components/realestate/premium-v2/RegisterIndexV2";
import { basePathFor, getTenantBySlug, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getProperties } from "@/lib/content";
import { withStats, sectorSlug, compareSectors } from "@/lib/register";
import { formatNumber } from "@/lib/format";

/*
 * No `dynamic = "force-static"` here, deliberately.
 *
 * These routes sit under `[tenant]` and do not enumerate that param
 * themselves, so a forced-static build has nothing to prerender — and
 * force-static also forbids rendering on demand, which left every one of
 * them 404ing in production while working fine in dev (where everything
 * renders on request). `revalidate` alone gives the same caching as the
 * maps and vastu routes, which build and serve correctly.
 */
export const revalidate = 300;

export async function generateMetadata(props: PageProps<"/site/[tenant]/sectors">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Gurgaon sectors — registered projects by sector — ${settings?.firmName ?? ""}`,
    description:
      "Every Gurugram sector with RERA-registered projects, with project counts, land area, unsold stock and how many have run past their filed completion date.",
  };
}

export default async function SectorsPage(props: PageProps<"/site/[tenant]/sectors">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  const basePath = basePathFor(tenant);
  const rows = withStats(await getProperties(tenant.id));

  const bySector = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.sector) continue;
    const list = bySector.get(r.sector) ?? [];
    list.push(r);
    bySector.set(r.sector, list);
  }

  const entries: IndexEntry[] = [...bySector.entries()]
    .sort((a, b) => compareSectors(a[0], b[0]))
    .map(([sector, list]) => ({
      label: `Sector ${sector}`,
      href: joinPath(basePath, `/sectors/${sectorSlug(sector)}`),
      projects: list.length,
      developers: new Set(list.map((r) => r.developer).filter(Boolean)).size,
      acres: Math.round(list.reduce((a, r) => a + (r.stats.acres ?? 0), 0)),
      unsold: list.reduce((a, r) => a + (r.stats.unsold ?? 0), 0),
      delayed: list.filter((r) => r.stats.delayed).length,
    }));

  return (
    <RegisterIndexV2
      basePath={basePath}
      eyebrow="Register index"
      heading="Gurgaon sectors"
      summary={`${formatNumber(entries.length)} sectors carry a RERA-registered project on the HRERA Gurugram register. Open any sector for its developers, unit availability and delivery record.`}
      columnLabel="Sector"
      secondaryLabel="Developers"
      entries={entries}
    />
  );
}
