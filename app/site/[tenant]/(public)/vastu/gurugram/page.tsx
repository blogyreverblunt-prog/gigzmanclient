import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { SECTORS } from "@/lib/vastu/sectors";
import { VASTU_DISCLAIMER } from "@/lib/vastu";
import { MARKET_PROVENANCE } from "@/lib/vastu/sector-content";
import { vastuSectorsEnabled } from "@/lib/vastu/enabled";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import LineArtBackdropV2 from "@/components/realestate/premium-v2/LineArtBackdropV2";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Vastu by Gurugram Sector — Every Sector and Colony | ${settings?.firmName ?? ""}`,
    description:
      "Vastu guidance for every Gurugram sector and named colony, with the corridor each sits on and what property there actually costs.",
    alternates: { canonical: joinPath(basePathFor(tenant), "/vastu/gurugram") },
  };
}

export default async function VastuGurugramIndexPage(props: Props) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);
  if (!vastuSectorsEnabled(tenant)) notFound();

  const localities = await getLocalities(tenant.id);
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  // Grouped by corridor so the index reads as a map of the city rather than a
  // wall of 137 identical links.
  const byCorridor = localities
    .map((l) => ({ locality: l, sectors: SECTORS.filter((s) => s.corridorSlug === l.slug) }))
    .filter((g) => g.sectors.length > 0);
  const grouped = new Set(byCorridor.flatMap((g) => g.sectors.map((s) => s.slug)));
  const ungrouped = SECTORS.filter((s) => !grouped.has(s.slug));

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Vastu", url: p("/vastu") },
            { name: "Gurugram sectors", url: p("/vastu/gurugram") },
          ]),
        )}
      />

      <GpSection tone="forest" className="py-14 sm:py-20"
        background={<LineArtBackdropV2 variant="building-right" opacity={0.6} desktopOnly />}
      >
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/vastu")} className="hover:text-[color:var(--gp-gold-300)]">Vastu</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Gurugram sectors</span>
          </nav>
          <GpEyebrow className="text-[color:var(--gp-gold-300)]">
            {SECTORS.length} sectors and colonies
          </GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-3xl text-white">
            Vastu by Gurugram sector
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/75">
            Vastu itself does not vary by sector — what varies is what is built there, and therefore
            how much of the tradition you can act on. Each page below pairs the guidance with the
            corridor that sector sits on and what property there currently costs.
          </p>
        </GpContainer>
      </GpSection>

      <GpSection tone="cream">
        <GpContainer>
          <div className="space-y-11">
            {byCorridor.map(({ locality, sectors }) => (
              <div key={locality.slug}>
                <h2 className="font-display text-[16px] text-[color:var(--gp-ink)]">{locality.name}</h2>
                <p className="mt-1.5 text-[13px] text-[color:var(--gp-muted)]">
                  {locality.avgPricePerSqft
                    ? `Around ₹${locality.avgPricePerSqft.toLocaleString("en-IN")} per sq ft`
                    : "Pricing varies by project"}
                  {locality.rentalYieldPercent != null
                    ? ` · ${locality.rentalYieldPercent.toFixed(1)}% gross rental yield`
                    : ""}
                </p>
                <RelatedCardsV2
                  className="mt-4"
                  items={[sectors.map((s) => (
                    ({ href: p(`/vastu/gurugram/${s.slug}`), title: s.name, subtitle: s.character })
                  ))].flat(2)}
                  icon={MapPin}
                  columns={3}
                />
              </div>
            ))}

            {ungrouped.length > 0 ? (
              <div>
                <RelatedCardsV2
                  title={`Other sectors and colonies`}
                  items={[ungrouped.map((s) => (
                    ({ href: p(`/vastu/gurugram/${s.slug}`), title: s.name, subtitle: s.character })
                  ))].flat(2)}
                  icon={MapPin}
                  columns={3}
                />
              </div>
            ) : null}
          </div>

          <p className="mt-11 max-w-3xl text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
            {MARKET_PROVENANCE}
          </p>
          <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
            {VASTU_DISCLAIMER}
          </p>
        </GpContainer>
      </GpSection>

    </>
  );
}
