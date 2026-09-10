import { notFound } from "next/navigation";
import PremiumV2PropertiesPage from "@/components/realestate/premium-v2/PremiumV2PropertiesPage";
import { getTenantBySlug } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getProperties } from "@/lib/content";
import { sectorSlug } from "@/lib/register";

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

/** Reverse the slug back to the label the register uses ("63a" -> "63A"). */
async function resolveSector(tenantId: string, slug: string) {
  const rows = await getProperties(tenantId);
  return rows.find((r) => r.sector && sectorSlug(r.sector) === slug.toLowerCase())?.sector ?? null;
}

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    if (templateKeyFor(tenant) !== "premium-v2") return [];
    const rows = await getProperties(tenant.id);
    const sectors = new Set(rows.map((r) => r.sector).filter((s): s is string => Boolean(s)));
    return [...sectors].map((s) => ({ sector: sectorSlug(s) }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/sectors/[sector]">) {
  const { tenant: tenantSlug, sector } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, label] = await Promise.all([
    getFirmSettings(tenant.id),
    resolveSector(tenant.id, sector),
  ]);
  if (!label) return {};
  return {
    title: `Property in Sector ${label}, Gurgaon — ${settings?.firmName ?? ""}`,
    description: `Every RERA-registered project in Sector ${label}, Gurugram — developers, land area, unit availability and delivery status, taken from the HRERA register.`,
  };
}

export default async function SectorPage(props: PageProps<"/site/[tenant]/sectors/[sector]">) {
  const { tenant: tenantSlug, sector } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  const label = await resolveSector(tenant.id, sector);
  if (!label) notFound();

  return <PremiumV2PropertiesPage tenant={tenant} scope={{ kind: "sector", sector: label }} />;
}
