import { notFound } from "next/navigation";
import PremiumV2PropertiesPage from "@/components/realestate/premium-v2/PremiumV2PropertiesPage";
import { getTenantBySlug } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getProperties } from "@/lib/content";
import { developerSlug } from "@/lib/register";

/** Static for the same reason /properties is — see PremiumV2PropertiesPage. */
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

async function resolveDeveloper(tenantId: string, slug: string) {
  const rows = await getProperties(tenantId);
  return rows.find((r) => r.developer && developerSlug(r.developer) === slug.toLowerCase())?.developer ?? null;
}

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    if (templateKeyFor(tenant) !== "premium-v2") return [];
    const rows = await getProperties(tenant.id);
    // One-project developers get no page: it would duplicate the listing it links to.
    const counts = new Map<string, number>();
    for (const r of rows) if (r.developer) counts.set(r.developer, (counts.get(r.developer) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([name]) => ({ slug: developerSlug(name) }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/builders/[slug]">) {
  const { tenant: tenantSlug, slug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, name] = await Promise.all([
    getFirmSettings(tenant.id),
    resolveDeveloper(tenant.id, slug),
  ]);
  if (!name) return {};
  return {
    title: `${name} projects in Gurgaon — ${settings?.firmName ?? ""}`,
    description: `Every ${name} project on the HRERA Gurugram register — sectors, land area, unit availability and how delivery is tracking against the dates filed.`,
  };
}

export default async function BuilderPage(props: PageProps<"/site/[tenant]/builders/[slug]">) {
  const { tenant: tenantSlug, slug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  const name = await resolveDeveloper(tenant.id, slug);
  if (!name) notFound();

  return <PremiumV2PropertiesPage tenant={tenant} scope={{ kind: "developer", developer: name }} />;
}
