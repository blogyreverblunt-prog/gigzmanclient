import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { AREA_UNITS, convertArea, findUnit, formatArea, pairSlug, unitPairs } from "@/lib/calculators/area-units";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import AreaConverterV2 from "@/components/realestate/premium-v2/tools/AreaConverterV2";
import LoanFaqV2 from "@/components/realestate/premium-v2/home-loan/LoanFaqV2";
import {
  ConversionTableV2,
  RelatedConversionsV2,
} from "@/components/realestate/premium-v2/tools/ToolSections";

/** Every ordered unit pair, for every real-estate tenant. */
export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const t = await getTenantBySlug(tenant.slug);
    if (!t || t.vertical !== "realestate") return [];
    return unitPairs().map((pair) => ({ pair: pairSlug(pair.from, pair.to) }));
  });
}

function resolve(pairParam: string) {
  for (const from of AREA_UNITS) {
    for (const to of AREA_UNITS) {
      if (from.slug !== to.slug && pairSlug(from, to) === pairParam) return { from, to };
    }
  }
  return null;
}

interface Props {
  params: Promise<{ tenant: string; pair: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, pair } = await params;
  const resolved = resolve(pair);
  const tenant = await getTenantBySlug(tenantSlug);
  if (!resolved || !tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  const one = formatArea(convertArea(1, resolved.from, resolved.to));
  return {
    title: `${resolved.from.name} to ${resolved.to.name} — 1 ${resolved.from.name} = ${one} ${resolved.to.name} | ${settings?.firmName ?? ""}`,
    description: `Convert ${resolved.from.name.toLowerCase()} to ${resolved.to.name.toLowerCase()} instantly. One ${resolved.from.name.toLowerCase()} equals ${one} ${resolved.to.name.toLowerCase()}, with a full conversion table and what the unit means for Gurugram property.`,
    alternates: { canonical: joinPath(basePathFor(tenant), `/area-converter/${pair}`) },
  };
}

export default async function AreaPairPage({ params }: Props) {
  const { tenant: tenantSlug, pair } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);
  const resolved = resolve(pair);
  if (!resolved) notFound();

  const { from, to } = resolved;
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const one = formatArea(convertArea(1, from, to));

  const faqs = [
    {
      question: `How many ${to.name.toLowerCase()} are there in 1 ${from.name.toLowerCase()}?`,
      answer: `One ${from.name.toLowerCase()} equals ${one} ${to.name.toLowerCase()}. One ${from.name.toLowerCase()} is ${formatArea(from.sqft)} square feet and one ${to.name.toLowerCase()} is ${formatArea(to.sqft)} square feet.`,
    },
    {
      question: `How do you convert ${from.name.toLowerCase()} to ${to.name.toLowerCase()}?`,
      answer: `Multiply the number of ${from.name.toLowerCase()} by ${formatArea(from.sqft)} to get square feet, then divide by ${formatArea(to.sqft)}. The calculator above does both steps.`,
    },
    ...(from.stateSpecific || to.stateSpecific
      ? [
          {
            question: `Is the ${(from.stateSpecific ? from : to).name.toLowerCase()} the same size everywhere in India?`,
            answer: `No. Marla, kanal, bigha, biswa, killa and murabba all vary by state, and a bigha in Rajasthan or Uttar Pradesh is a different size from a Haryana bigha. The values used here are the Haryana ones, which are what apply to Gurugram land records — confirm the state before relying on any conversion.`,
          },
        ]
      : []),
    {
      question: `Which unit are Gurugram properties actually sold in?`,
      answer: `Apartments are quoted in square feet. Plots and builder floors are usually quoted in square yards, which people locally call gaj, and larger plots in marla or kanal. Agricultural land is transacted in killa, which is an acre.`,
    },
  ];

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Area Converter", url: p("/area-converter") },
            { name: `${from.name} to ${to.name}`, url: p(`/area-converter/${pair}`) },
          ]),
        )}
      />
      {buildFaqJsonLd(faqs) ? <script {...jsonLdProps(buildFaqJsonLd(faqs))} /> : null}

      <AreaConverterV2
        heading={`${from.name} to ${to.name} Converter`}
        subheading={`One ${from.name.toLowerCase()} equals ${one} ${to.name.toLowerCase()}. Convert any quantity below, and see what the size means for a plot in Gurugram.`}
        initialFrom={from.slug}
        initialTo={to.slug}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/area-converter")} className="hover:text-[color:var(--gp-gold-300)]">Area Converter</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">{from.name} to {to.name}</span>
          </nav>
        }
      />

      <ConversionTableV2 from={from} to={to} />

      <LoanFaqV2 faqs={faqs} heading={`${from.name} to ${to.name}, answered`} />

      <RelatedConversionsV2 from={from} to={to} p={p} />

    </>
  );
}
