import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { propertyManagementPageEnabled } from "@/lib/premium-v2/home-sections";
import { MANAGEMENT_FAQS } from "@/lib/premium-v2/property-management";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import { ogFor } from "@/lib/og";
import PmHero from "@/components/realestate/premium-v2/property-management/PmHero";
import PmServices from "@/components/realestate/premium-v2/property-management/PmServices";
import PmControlCentre from "@/components/realestate/premium-v2/property-management/PmControlCentre";
import PmJourney from "@/components/realestate/premium-v2/property-management/PmJourney";
import PmMaintenance from "@/components/realestate/premium-v2/property-management/PmMaintenance";
import PmPerformance from "@/components/realestate/premium-v2/property-management/PmPerformance";
import PmCoverage from "@/components/realestate/premium-v2/property-management/PmCoverage";
import PmOwnerStories from "@/components/realestate/premium-v2/property-management/PmOwnerStories";
import PmConsultation from "@/components/realestate/premium-v2/property-management/PmConsultation";

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || !propertyManagementPageEnabled(tenant)) return {};
  const settings = await getFirmSettings(tenant.id);
  const firmName = settings?.firmName ?? "";
  const path = joinPath(basePathFor(tenant), "/property-management");

  return {
    title: `Property Management in Gurugram — Tenants, Rent & Upkeep | ${firmName}`,
    description:
      "End-to-end property management in Gurugram: tenant sourcing and verification, rent collection, inspections, maintenance coordination and owner reporting. Built for local owners, investors and NRIs.",
    alternates: { canonical: path },
    ...ogFor({
      title: `Property Management in Gurugram | ${firmName}`,
      description:
        "Tenant sourcing, rent collection, inspections and reporting — managed end to end, with a local Gurugram team.",
      path,
    }),
  };
}

export default async function PropertyManagementPage(props: Props) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  // Allowlisted, not template-wide: every photograph on this page carries
  // High Properties' own branding.
  if (!propertyManagementPageEnabled(tenant)) notFound();

  const settings = await getFirmSettings(tenant.id);
  if (!settings) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const firmName = settings.firmName;

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Property Management", url: p("/property-management") },
          ]),
        )}
      />
      <script {...jsonLdProps(buildFaqJsonLd([...MANAGEMENT_FAQS]))} />

      <PmHero firmName={firmName} />
      <PmServices />
      <PmControlCentre firmName={firmName} />
      <PmJourney />
      <PmMaintenance firmName={firmName} />
      <PmPerformance />
      <PmCoverage firmName={firmName} />
      <PmOwnerStories firmName={firmName} />
      {/* The page's closing band is the site-wide consultation CTA the tenant
          layout appends after this — the pack's own final CTA would have made
          three enquiry asks in a row and broken the "same closing CTA on every
          page" rule the rest of the site follows. */}
      <PmConsultation thankYouHref={p("/thank-you")} />
    </>
  );
}
