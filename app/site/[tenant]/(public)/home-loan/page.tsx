import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities, getProperties } from "@/lib/content";
import { homeLoanEnabled } from "@/lib/home-loan/enabled";
import { templateKeyFor } from "@/lib/templates";
import { buildAffordability, affordabilityVerdict } from "@/lib/home-loan/affordability";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";
import EmiCalculatorHeroV2 from "@/components/realestate/premium-v2/home-loan/EmiCalculatorHeroV2";
import {
  GurugramBudgetV2,
  RelatedAmountsV2,
} from "@/components/realestate/premium-v2/home-loan/LoanSectionsV2";

const DEFAULT_LOAN = 7_500_000;

export async function generateMetadata(
  props: PageProps<"/site/[tenant]/home-loan">,
): Promise<Metadata> {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  const basePath = basePathFor(tenant);
  return {
    title: `Home Loan EMI Calculator for Gurugram — ${settings?.firmName ?? ""}`,
    description:
      "Calculate your home loan EMI, compare lenders, and see what each budget buys across Gurugram's property corridors — with application support from an authorised channel partner.",
    alternates: { canonical: joinPath(basePath, "/home-loan") },
  };
}

export default async function HomeLoanHubPage(props: PageProps<"/site/[tenant]/home-loan">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  // Vertical/template gate as well as the feature flag, matching every other
  // premium-v2 family (see `vastu/gurugram/page.tsx`). The flag alone was the
  // whole gate here, so a `clients.features.homeLoan` set on a non-real-estate
  // row would have published "authorised channel partner" copy and lender
  // trademarks on that client's site. `updateClientFeatures` now refuses to set
  // it; this is the second, independent half — a row that carries the flag by
  // any other route still cannot render the claim. Keep in step with
  // `homeLoanEntries()` in lib/sitemap.ts and the sibling routes under
  // `home-loan/`.
  if (!tenant || templateKeyFor(tenant) !== "premium-v2" || !homeLoanEnabled(tenant)) {
    notFound();
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const [settings, localities, properties] = await Promise.all([
    getFirmSettings(tenant.id),
    getLocalities(tenant.id),
    getProperties(tenant.id, {}),
  ]);
  if (!settings) notFound();

  const snapshot = buildAffordability(DEFAULT_LOAN, localities, properties);

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Home Loans", url: p("/home-loan") },
          ]),
        )}
      />

      <EmiCalculatorHeroV2
        heading="Home Loan EMI Calculator for Gurugram"
        subheading="Calculate your EMI, compare the total borrowing cost and plan a confident property purchase in Gurugram."
        initialPrice={snapshot.propertyBudget}
        initialDownPayment={snapshot.downPayment}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Home Loans</span>
          </nav>
        }
      />

      <GurugramBudgetV2
        amount={{ slug: "", value: DEFAULT_LOAN, label: "₹75 Lakh", plain: "75 lakh" }}
        snapshot={snapshot}
        verdict={affordabilityVerdict(snapshot)}
        p={p}
      />

      <RelatedAmountsV2 p={p} />

    </>
  );
}
