import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities, getLocality, getProperties } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import { formatInr, formatIndianPrice } from "@/lib/format";
import RentalYieldCalculatorV2 from "@/components/realestate/premium-v2/tools/RentalYieldCalculatorV2";
import LoanFaqV2 from "@/components/realestate/premium-v2/home-loan/LoanFaqV2";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const rows = await getLocalities(tenant.id);
    return rows.map((row) => ({ corridor: row.slug }));
  });
}

interface Props {
  params: Promise<{ tenant: string; corridor: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, corridor } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, locality] = await Promise.all([
    getFirmSettings(tenant.id),
    getLocality(tenant.id, corridor),
  ]);
  if (!locality) return {};
  const gy = locality.rentalYieldPercent ?? 0;
  return {
    title: `Rental Yield in ${locality.name} — Payback in ${gy > 0 ? Math.round(100 / gy) : "—"} Years | ${settings?.firmName ?? ""}`,
    description: `What a property in ${locality.name} earns, and how long it takes to pay for itself once rent, vacancy and appreciation are all counted.`,
    alternates: { canonical: joinPath(basePathFor(tenant), `/rental-yield/${corridor}`) },
  };
}

export default async function CorridorYieldPage({ params }: Props) {
  const { tenant: tenantSlug, corridor } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const [settings, locality, listings] = await Promise.all([
    getFirmSettings(tenant.id),
    getLocality(tenant.id, corridor),
    getProperties(tenant.id, { locality: undefined }),
  ]);
  if (!settings || !locality) notFound();

  const gy = locality.rentalYieldPercent ?? 0;
  const yoy = locality.yoyChangePercent ?? 0;
  const rentOnly = gy > 0 ? 100 / gy : null;
  const combined = gy * 0.9 + yoy > 0 ? 100 / (gy * 0.9 + yoy) : null;
  const rate = locality.avgPricePerSqft ?? 0;
  // A representative 1,800 sq ft floor, the common Gurugram builder-floor size.
  const sampleValue = rate * 1800;
  const inCorridor = listings.filter((l) => l.corridor === locality.corridor || l.locality === locality.name);

  const faqs = [
    {
      question: `What is the rental yield in ${locality.name}?`,
      answer: `Our working estimate is about ${gy.toFixed(1)}% gross. Net of vacancy and running costs it lands lower. That is typical for Gurugram — yields here sit well below the 6–8% seen in some other Indian cities.`,
    },
    {
      question: `How many years until a property in ${locality.name} pays for itself?`,
      answer: rentOnly
        ? `On rent alone, roughly ${Math.round(rentOnly)} years. Counting capital appreciation of about ${yoy.toFixed(1)}% a year alongside the rent, the figure drops to around ${combined ? Math.round(combined) : "—"} years. Appreciation, not rent, does most of the work here.`
        : `We do not have a verified yield figure for this corridor yet.`,
    },
    {
      question: `Is ${locality.name} a good corridor to buy for rental income?`,
      answer: `If monthly income is the only goal, Gurugram as a whole is a weak rental market and ${locality.name} is no exception. It makes more sense as an appreciation play with rent covering part of the holding cost. An advisor can tell you which sectors within the corridor actually let quickly.`,
    },
    {
      question: `What is the difference between gross and net rental yield?`,
      answer: `Gross yield divides annual rent by the property value. Net yield first takes out the months the property sits empty and the cost of maintaining it — which is why the net figure is always the lower and more useful of the two.`,
    },
  ];

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Rental Yield", url: p("/rental-yield") },
            { name: locality.name, url: p(`/rental-yield/${corridor}`) },
          ]),
        )}
      />
      {buildFaqJsonLd(faqs) ? <script {...jsonLdProps(buildFaqJsonLd(faqs))} /> : null}

      <RentalYieldCalculatorV2
        heading={`Rental Yield in ${locality.name}`}
        subheading={
          rentOnly
            ? `At our working estimate of ${gy.toFixed(1)}% gross, rent alone takes about ${Math.round(rentOnly)} years to return the purchase price here. Adjust the floors and rents below for your own property.`
            : `Work out what a property in ${locality.name} earns and how long it takes to pay for itself.`
        }
        initialValue={sampleValue > 0 ? Math.round(sampleValue) : 20000000}
        initialAppreciation={yoy || 8}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/rental-yield")} className="hover:text-[color:var(--gp-gold-300)]">Rental Yield</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">{locality.name}</span>
          </nav>
        }
      />

      <GpSection tone="cream">
        <GpContainer>
          <GpEyebrow>{locality.corridor ?? locality.name}</GpEyebrow>
          <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
            What the numbers say about {locality.name}
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Avg. rate", value: rate ? `${formatInr(rate)}/sq.ft` : "—" },
              { label: "Gross yield", value: gy ? `${gy.toFixed(1)}%` : "—" },
              { label: "Payback on rent", value: rentOnly ? `${Math.round(rentOnly)} yrs` : "—" },
              { label: "With appreciation", value: combined ? `${Math.round(combined)} yrs` : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                <p className="text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--gp-muted)]">{s.label}</p>
                <p className="font-sans mt-1.5 text-[24px] font-semibold text-[color:var(--gp-gold-600)]">{s.value}</p>
              </div>
            ))}
          </div>

          {locality.description ? (
            <p className="mt-8 max-w-3xl text-[14.5px] leading-relaxed text-[color:var(--gp-body)]">
              {locality.description}
            </p>
          ) : null}

          <p className="mt-4 text-[12px] text-[color:var(--gp-muted)]">
            A representative 1,800 sq.ft floor at this corridor&rsquo;s rate works out to about{" "}
            {formatIndianPrice(sampleValue)}. Figures are working estimates pending independent
            verification, not certified valuations.
          </p>

          <Link
            href={p(`/localities/${locality.slug}`)}
            className="mt-7 inline-flex min-h-[48px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-forest-900)] px-6 text-[13.5px] font-semibold uppercase tracking-[0.04em] text-white transition-colors hover:bg-[color:var(--gp-forest-800)]"
          >
            Full {locality.name} guide
          </Link>
        </GpContainer>
      </GpSection>

      <LoanFaqV2 faqs={faqs} heading={`Renting out in ${locality.name}, answered`} />

    </>
  );
}
