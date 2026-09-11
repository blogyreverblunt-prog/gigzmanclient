import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Map } from "lucide-react";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities, getProperties, getPropertyImagesFor } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { MAP_AREAS, AREA_KIND_LABELS, findMapArea, mapImageSrc } from "@/lib/maps/areas";
import blurPlaceholders from "@/lib/maps/blur-placeholders.json";
import { ogFor } from "@/lib/og";
import { findSector } from "@/lib/vastu/sectors";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import PlotMapViewerV2 from "@/components/realestate/premium-v2/maps/PlotMapViewerV2";
import PropertyCardV2 from "@/components/realestate/premium-v2/PropertyCardV2";
import MapCtaBandV2 from "@/components/realestate/premium-v2/maps/MapCtaBandV2";
import LoanFaqV2 from "@/components/realestate/premium-v2/home-loan/LoanFaqV2";
import ScrollDepthTracker from "@/components/realestate/premium-v2/ScrollDepthTracker";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import LineArtBackdropV2 from "@/components/realestate/premium-v2/LineArtBackdropV2";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";

const BLUR = blurPlaceholders as Record<string, string>;

/** Unknown params 404 instead of rendering on demand — see lib/static-params.ts. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const t = await getTenantBySlug(tenant.slug);
    if (!t || t.vertical !== "realestate") return [];
    return MAP_AREAS.map((a) => ({ area: a.slug }));
  });
}

interface Props {
  params: Promise<{ tenant: string; area: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, area: areaSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const area = findMapArea(areaSlug);
  if (!tenant || !area) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `${area.name} Plot Map, Gurugram — Zoomable | ${settings?.firmName ?? ""}`,
    description: `${area.blurb} Zoom in to read plot numbers, or open the map full screen.`,
    alternates: { canonical: joinPath(basePathFor(tenant), `/maps/gurgaon/${area.slug}`) },
    ...ogFor({
      title: `${area.name} Plot Map, Gurugram`,
      description: area.blurb,
      image: mapImageSrc(area.slug),
      path: joinPath(basePathFor(tenant), `/maps/gurgaon/${area.slug}`),
    }),
  };
}

export default async function PlotMapPage({ params }: Props) {
  const { tenant: tenantSlug, area: areaSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);
  const area = findMapArea(areaSlug);
  if (!area) notFound();

  const [localities, allProperties] = await Promise.all([
    getLocalities(tenant.id),
    getProperties(tenant.id),
  ]);
  const corridor = area.corridorSlug ? localities.find((l) => l.slug === area.corridorSlug) : undefined;

  // Listings on the same corridor, falling back to featured stock so the
  // section is never an empty shell on a map whose corridor has no inventory.
  const onCorridor = corridor
    ? allProperties.filter((x) => x.corridor === corridor.name || x.locality === corridor.name)
    : [];
  const nearby = (onCorridor.length >= 3 ? onCorridor : allProperties).slice(0, 3);
  const nearbyImages = await getPropertyImagesFor(nearby.map((x) => x.id));
  const nearbyImageMap = Object.fromEntries(
    nearby.map((x) => {
      const imgs = nearbyImages[x.id] ?? [];
      const primary = imgs.find((i) => i.isPrimary) ?? imgs[0] ?? null;
      return [x.id, primary ? { path: primary.path, alt: primary.alt } : undefined] as const;
    }),
  );

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  // A map area that is also a vastu sector links across, so the two families
  // reinforce each other instead of sitting in separate silos.
  const vastuSector = findSector(area.slug);

  const faqs = [
    {
      question: `Where can I see the ${area.name} plot map?`,
      answer: `It is on this page. Zoom in with the + control, double-tap, or open it full screen to read individual plot numbers and block letters — the map is served at full resolution when you zoom, so the numbering stays legible.`,
    },
    {
      question: `What does the ${area.name} map show?`,
      answer: `${area.blurb}`,
    },
    corridor?.avgPricePerSqft
      ? {
          question: `What do properties in ${area.name} cost?`,
          answer: `${area.name} sits on the ${corridor.name} corridor, which averages around ₹${corridor.avgPricePerSqft.toLocaleString("en-IN")} per square foot. That is a corridor-wide working figure shared by every area on it, not independently verified and not a valuation of this one — individual plots vary well beyond it. Ask us for the recent transacted range on a specific block.`,
        }
      : {
          question: `Is this map official?`,
          answer: `It is a reference drawing of the published layout, provided to help you locate a plot and understand the block structure. Confirm plot dimensions and boundaries against the sanctioned plan and the title documents before you transact.`,
        },
    {
      question: `Can you tell me what is available in ${area.name}?`,
      answer: `Yes — tell us the block or plot size you are looking at and an advisor will call back with what is currently on the market there.`,
    },
  ];

  const related = MAP_AREAS.filter(
    (a) => a.slug !== area.slug && a.corridorSlug && a.corridorSlug === area.corridorSlug,
  ).slice(0, 12);

  return (
    <>
      <ScrollDepthTracker pageType="plot_map" />
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Maps", url: p("/maps/gurgaon") },
            { name: area.name, url: p(`/maps/gurgaon/${area.slug}`) },
          ]),
        )}
      />
      {buildFaqJsonLd(faqs) ? <script {...jsonLdProps(buildFaqJsonLd(faqs))} /> : null}

      <GpSection tone="forest" className="py-12 sm:py-16"
        background={<LineArtBackdropV2 variant="building-right" opacity={0.6} desktopOnly />}
      >
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-5 text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/maps/gurgaon")} className="hover:text-[color:var(--gp-gold-300)]">Maps</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">{area.name}</span>
          </nav>

          <GpEyebrow className="text-[color:var(--gp-gold-300)]">
            {AREA_KIND_LABELS[area.kind]}
            {corridor ? ` · ${corridor.name}` : ""}
          </GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-3xl text-white">
            {area.name} Plot Map, Gurugram
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75">{area.blurb}</p>
        </GpContainer>
      </GpSection>

      <GpSection tone="cream" className="pt-8">
        <GpContainer>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
            <PlotMapViewerV2
              slug={area.slug}
              name={area.name}
              src={mapImageSrc(area.slug)}
              blurDataURL={BLUR[area.slug]}
            />

            <div className="space-y-5">
              {corridor ? (
                <div className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                  <GpEyebrow className="text-[color:var(--gp-gold-600)]">
                    {corridor.name} corridor
                  </GpEyebrow>
                  <dl className="mt-4 space-y-3">
                    {[
                      {
                        label: "Average price",
                        value: corridor.avgPricePerSqft
                          ? `₹${corridor.avgPricePerSqft.toLocaleString("en-IN")}/sq ft`
                          : "—",
                      },
                      {
                        label: "Year on year",
                        value:
                          corridor.yoyChangePercent != null
                            ? `${corridor.yoyChangePercent > 0 ? "+" : ""}${corridor.yoyChangePercent.toFixed(1)}%`
                            : "—",
                      },
                      {
                        label: "Gross rental yield",
                        value:
                          corridor.rentalYieldPercent != null
                            ? `${corridor.rentalYieldPercent.toFixed(1)}%`
                            : "—",
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[color:var(--gp-border)] pb-2.5 last:border-b-0 last:pb-0">
                        <dt className="text-[13px] text-[color:var(--gp-muted)]">{row.label}</dt>
                        <dd className="font-sans text-[15px] font-semibold text-[color:var(--gp-ink)]">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-[11.5px] leading-relaxed text-[color:var(--gp-muted)]">
                    Corridor-wide working averages, shared by every area on this corridor and not
                    independently verified — not a valuation of {area.name}.
                  </p>
                  <Link
                    href={p(`/localities/${corridor.slug}`)}
                    className="mt-4 inline-flex text-[13px] font-medium text-[color:var(--gp-gold-600)] hover:underline"
                  >
                    See the {corridor.name} corridor →
                  </Link>
                </div>
              ) : null}

              <div className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                <h2 className="font-display text-[15px] text-[color:var(--gp-ink)]">
                  Looking at a specific plot?
                </h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--gp-body)]">
                  Zoom in, note the block and plot number, and we will tell you what is available
                  there and what it recently transacted at.
                </p>
                <Link
                  href={p("/properties")}
                  className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] text-[13px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
                >
                  See what is on the market
                </Link>
              </div>

              {vastuSector ? (
                <div className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                  <h2 className="font-display text-[15px] text-[color:var(--gp-ink)]">
                    Vastu for {area.name}
                  </h2>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--gp-body)]">
                    Which facings and layouts the tradition prefers here, and how much of it you can
                    act on given what is built.
                  </p>
                  <Link
                    href={p(`/vastu/gurugram/${vastuSector.slug}`)}
                    className="mt-3 inline-flex text-[13px] font-medium text-[color:var(--gp-gold-600)] hover:underline"
                  >
                    Open the {area.name} vastu guide →
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </GpContainer>
      </GpSection>

      <MapCtaBandV2 areaName={area.name} propertiesHref={p("/properties")} />

      {nearby.length > 0 ? (
        <GpSection tone="cream" className="pt-0">
          <GpContainer>
            <GpEyebrow>On this corridor</GpEyebrow>
            <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
              Property near {area.name}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {nearby.map((property) => (
                <PropertyCardV2
                  key={property.id}
                  property={property}
                  href={p(`/properties/${property.slug}`)}
                  imagePath={nearbyImageMap[property.id]?.path}
                  imageAlt={nearbyImageMap[property.id]?.alt ?? undefined}
                />
              ))}
            </div>
            <Link
              href={p("/properties")}
              className="mt-7 inline-flex text-[13.5px] font-medium text-[color:var(--gp-gold-600)] hover:underline"
            >
              See all listings →
            </Link>
          </GpContainer>
        </GpSection>
      ) : null}

      <LoanFaqV2 faqs={faqs} heading={`${area.name} map, answered`} />

      {related.length > 0 ? (
        <GpSection tone="cream" className="pt-0">
          <GpContainer>
            <RelatedCardsV2
              title={`Other maps on the ${corridor?.name ?? "same corridor"}`}
              items={related.map((a) => ({
                href: p(`/maps/gurgaon/${a.slug}`),
                title: a.name,
                subtitle: a.blurb ?? AREA_KIND_LABELS[a.kind],
              }))}
              icon={Map}
            />
            <Link
              href={p("/maps/gurgaon")}
              className="mt-6 inline-flex text-[13.5px] font-medium text-[color:var(--gp-gold-600)] hover:underline"
            >
              All {MAP_AREAS.length} Gurugram plot maps →
            </Link>
          </GpContainer>
        </GpSection>
      ) : null}

    </>
  );
}
