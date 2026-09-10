import { notFound } from "next/navigation";
import PremiumV2PropertiesPage from "@/components/realestate/premium-v2/PremiumV2PropertiesPage";
import { getTenantBySlug } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings } from "@/lib/content";

/**
 * Reads no `searchParams` — see PremiumV2PropertiesPage for why.
 *
 * The pre-premium-v2 listing UI that used to live here was the last consumer
 * of request-time search params, and it had become unreachable: premium-v2 is
 * the only surviving template (lib/templates), and `/properties` exists only
 * in the real-estate vertical, so every tenant that can reach this route
 * renders the premium-v2 page. Keeping the dead branch would have kept the
 * whole route dynamic for no one's benefit.
 */
/**
 * Required, not decorative: a page that *could* read `searchParams` is treated
 * as dynamic by default even when it never does, which is what kept this route
 * server-rendering on every request after the search-param reads were removed.
 * Declaring it static is the explicit opt-in. `searchParams` is empty on the
 * server as a result — the filters read them in the browser instead.
 */
export const dynamic = "force-static";
export const revalidate = 300;

export async function generateMetadata(props: PageProps<"/site/[tenant]/properties">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Properties — ${settings?.firmName ?? ""}`,
    description:
      "Browse residential and commercial listings by locality, budget and configuration. Every listing shows its RERA registration status.",
  };
}

export default async function PropertiesPage(props: PageProps<"/site/[tenant]/properties">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  return <PremiumV2PropertiesPage tenant={tenant} />;
}
