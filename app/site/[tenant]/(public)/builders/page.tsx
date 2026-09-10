import { notFound } from "next/navigation";
import RegisterIndexV2, { type IndexEntry } from "@/components/realestate/premium-v2/RegisterIndexV2";
import { basePathFor, getTenantBySlug, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getProperties } from "@/lib/content";
import { withStats } from "@/lib/register";
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

export async function generateMetadata(props: PageProps<"/site/[tenant]/builders">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Gurgaon developers — projects by builder — ${settings?.firmName ?? ""}`,
    description:
      "Developers on the HRERA Gurugram register, with how many projects each holds, the land they cover, unsold stock and how delivery is tracking against their filed dates.",
  };
}

export default async function BuildersPage(props: PageProps<"/site/[tenant]/builders">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  const basePath = basePathFor(tenant);
  const rows = withStats(await getProperties(tenant.id));

  const byDev = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.developer) continue;
    const list = byDev.get(r.developer) ?? [];
    list.push(r);
    byDev.set(r.developer, list);
  }

  // Matches generateStaticParams on the detail route: a single-project
  // developer page would only restate the listing it links to.
  const entries: IndexEntry[] = [...byDev.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, list]) => ({
      label: name,
      // The row leads to the listings for that promoter, not to its register
      // page — asked for explicitly, on the reasoning that someone browsing
      // developers is shopping, not auditing filings. The register page at
      // /builders/{slug} still exists and is still in the sitemap; it is just
      // no longer linked from this index.
      href: joinPath(basePath, `/properties?developer=${encodeURIComponent(name)}`),
      withLogo: true,
      projects: list.length,
      acres: Math.round(list.reduce((a, r) => a + (r.stats.acres ?? 0), 0)),
      unsold: list.reduce((a, r) => a + (r.stats.unsold ?? 0), 0),
      delayed: list.filter((r) => r.stats.delayed).length,
    }));

  return (
    <RegisterIndexV2
      basePath={basePath}
      eyebrow="Register index"
      heading="Gurgaon developers"
      summary={`${formatNumber(entries.length)} developers hold two or more registered projects in Gurugram. Open any developer for their sector spread, unit availability and delivery record.`}
      columnLabel="Developer"
      entries={entries}
    />
  );
}
