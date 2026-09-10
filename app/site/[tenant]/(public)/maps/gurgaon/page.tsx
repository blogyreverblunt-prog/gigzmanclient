import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { MAP_AREAS, AREA_KIND_LABELS, mapImageSrc, type AreaKind } from "@/lib/maps/areas";
import blurPlaceholders from "@/lib/maps/blur-placeholders.json";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";
import ScrollDepthTracker from "@/components/realestate/premium-v2/ScrollDepthTracker";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import LineArtBackdropV2 from "@/components/realestate/premium-v2/LineArtBackdropV2";
import MapSearchV2 from "@/components/realestate/premium-v2/maps/MapSearchV2";

const BLUR = blurPlaceholders as Record<string, string>;

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Gurugram Plot Maps — ${MAP_AREAS.length} Sectors & Colonies | ${settings?.firmName ?? ""}`,
    description:
      "Zoomable plot maps for Gurugram sectors, licensed colonies and industrial estates. Read plot numbers and block letters at full resolution.",
    alternates: { canonical: joinPath(basePathFor(tenant), "/maps/gurgaon") },
  };
}

const GROUP_ORDER: AreaKind[] = ["masterplan", "colony", "sector", "industrial"];

export default async function MapsIndexPage(props: Props) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);

  const localities = await getLocalities(tenant.id);
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const groups = GROUP_ORDER.map((kind) => ({
    kind,
    label: AREA_KIND_LABELS[kind],
    areas: MAP_AREAS.filter((a) => a.kind === kind),
  })).filter((g) => g.areas.length > 0);

  return (
    <>
      <ScrollDepthTracker pageType="maps_index" />
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Maps", url: p("/maps/gurgaon") },
          ]),
        )}
      />

      <GpSection tone="forest" className="py-14 sm:py-20"
        background={<LineArtBackdropV2 variant="building-right" opacity={0.6} desktopOnly />}
      >
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-5 text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Maps</span>
          </nav>
          <GpEyebrow className="text-[color:var(--gp-gold-300)]">
            {MAP_AREAS.length} maps
          </GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-3xl text-white">
            Gurugram plot maps
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75">
            Sector and colony layouts with plot numbers, block letters and land-use reservations.
            Every map opens full screen and stays sharp when you zoom, so the plot numbering is
            actually readable rather than a blur.
          </p>

          <div className="mt-8">
            <MapSearchV2
              basePath={basePath}
              areas={MAP_AREAS.map((a) => ({ slug: a.slug, name: a.name }))}
            />
          </div>
        </GpContainer>
      </GpSection>

      <GpSection tone="cream">
        <GpContainer>
          <div className="space-y-14">
            {groups.map((group) => (
              <div key={group.kind}>
                <h2 className="font-display text-[16px] text-[color:var(--gp-ink)]">
                  {group.label === "Master plan" ? "Master plans" : `${group.label}s`}
                  <span className="ml-2 text-[14px] font-normal text-[color:var(--gp-muted)]">
                    {group.areas.length}
                  </span>
                </h2>

                <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.areas.map((area) => {
                    const corridor = area.corridorSlug
                      ? localities.find((l) => l.slug === area.corridorSlug)
                      : undefined;
                    return (
                      <Link
                        key={area.slug}
                        href={p(`/maps/gurgaon/${area.slug}`)}
                        className="group overflow-hidden rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white transition-colors hover:border-[color:var(--gp-gold-600)]"
                      >
                        <div className="relative aspect-[3/2] overflow-hidden bg-[color:var(--gp-cream-200)]">
                          <Image
                            src={mapImageSrc(area.slug)}
                            alt={`${area.name} plot map`}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
                            quality={70}
                            placeholder={BLUR[area.slug] ? "blur" : "empty"}
                            blurDataURL={BLUR[area.slug]}
                            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="font-display text-[15px] text-[color:var(--gp-ink)]">
                            {area.name}
                          </h3>
                          <p className="mt-1 text-[12px] text-[color:var(--gp-muted)]">
                            {corridor ? corridor.name : AREA_KIND_LABELS[area.kind]}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-12 max-w-3xl text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
            These are reference drawings of published layouts, provided to help you locate a plot and
            understand the block structure. Confirm plot dimensions, boundaries and title against the
            sanctioned plan and the property documents before you transact.
          </p>
        </GpContainer>
      </GpSection>

    </>
  );
}
