import Link from "next/link";
import { Award, Building2, LineChart, MapPinned } from "lucide-react";
import type { localities } from "@/lib/db/schema";
import { formatIndianPrice } from "@/lib/format";
import { joinPath } from "@/lib/paths";
import { GpContainer, GpEyebrow } from "./gp-primitives";
import LocalitySearchFormV2 from "./LocalitySearchFormV2";
import LocalityCorridorGridV2 from "./LocalityCorridorGridV2";
import LocalityMapExplorerV2 from "./LocalityMapExplorerV2";
import LocalityCompareTableV2 from "./LocalityCompareTableV2";
import LocalityGrowthCatalystsV2 from "./LocalityGrowthCatalystsV2";
import PopularSectorsV2 from "./PopularSectorsV2";
import { buildBreadcrumbJsonLd, buildItemListJsonLd, jsonLdProps } from "@/lib/schema-org";

type Locality = typeof localities.$inferSelect;

const HERO_IMAGE = "/verticals/realestate/templates/premium-v2/images/hero-locality-discovery.png";

export default function PremiumV2LocalitiesIndexPage({
  localities,
  sectorFacets,
  basePath,
}: {
  localities: Locality[];
  /** Sectors with live inventory, most-stocked first — see getPropertySectorFacets. */
  sectorFacets: { sector: string; count: number }[];
  basePath: string;
}) {
  const p = (path: string) => joinPath(basePath, path);

  const itemListJsonLd = buildItemListJsonLd(
    localities.map((locality) => ({
      name: locality.name,
      url: p(`/localities/${locality.slug}`),
      image: locality.heroImage,
    })),
  );

  // Computed from the seeded corridor rows rather than hardcoded. Note the
  // underlying figures are still marked `_status: placeholder` in the client
  // YAML, so on-page copy must not present them as verified market data.
  const priced = localities.filter((loc) => typeof loc.avgPricePerSqft === "number");
  const avgPricePerSqft =
    priced.length > 0
      ? Math.round(priced.reduce((sum, loc) => sum + (loc.avgPricePerSqft ?? 0), 0) / priced.length)
      : null;
  const yoyValues = localities.filter((loc) => loc.yoyChangePercent != null);
  const avgYoy =
    yoyValues.length > 0
      ? yoyValues.reduce((sum, loc) => sum + (loc.yoyChangePercent ?? 0), 0) / yoyValues.length
      : null;
  const totalActiveProjects = localities.reduce((sum, loc) => sum + (loc.activeProjects ?? 0), 0);

  const localityOptions = localities.map((loc) => ({ name: loc.name, slug: loc.slug }));
  // Labels only — the search box resolves a typed sector against this, so it
  // must be every stocked sector, not just the twelve the cards below show.
  const sectorOptions = sectorFacets.map((facet) => facet.sector);

  const stats = [
    { icon: MapPinned, value: `${localities.length}`, label: "Localities Tracked" },
    {
      icon: LineChart,
      value: avgPricePerSqft ? `${formatIndianPrice(avgPricePerSqft)}/sq.ft` : "—",
      label: "Avg. Price / Sqft",
    },
    {
      icon: Award,
      value: avgYoy != null ? `${avgYoy >= 0 ? "+" : ""}${avgYoy.toFixed(1)}%` : "—",
      label: "Avg. YoY Change",
    },
    { icon: Building2, value: `${totalActiveProjects}`, label: "Active Projects" },
  ];

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Localities", url: p("/localities") },
          ]),
        )}
      />
      {localities.length > 0 ? <script {...jsonLdProps(itemListJsonLd)} /> : null}

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-[color:var(--gp-forest-950)]">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{ background: "var(--gp-gradient-glow)" }}
          aria-hidden="true"
        />
        <GpContainer className="relative py-20 sm:py-24">
          <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/50">
            <Link href={p("/")} className="inline-block py-1 hover:text-[color:var(--gp-gold-300)]">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/75">Localities</span>
          </nav>

          <GpEyebrow className="text-[color:var(--gp-gold-300)]">Gurugram Locality Intelligence</GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-2xl text-white">
            Discover the address before the apartment.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/70 sm:text-base">
            Five corridors, tracked on price movement, rental yield and active supply — the same
            figures our advisors use when they shortlist a property for you.
          </p>

          <div className="mt-8 max-w-xl">
            <LocalitySearchFormV2
              basePath={basePath}
              localityOptions={localityOptions}
              sectorOptions={sectorOptions}
            />
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/15 pt-8 sm:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                  <div>
                    <dt className="font-sans text-[24px] font-semibold leading-none text-[color:var(--gp-gold-300)]">
                      {stat.value}
                    </dt>
                    <dd className="mt-1 text-[11.5px] leading-snug text-white/65">{stat.label}</dd>
                  </div>
                </div>
              );
            })}
          </dl>
        </GpContainer>
      </div>

      {localities.length === 0 ? (
        <GpContainer className="py-16 text-center">
          <p className="font-display text-[15px] text-[color:var(--gp-ink)]">
            Locality pages are being added.
          </p>
        </GpContainer>
      ) : (
        <>
          {/* ── Five different Gurugram stories ─────────────────────────── */}
          <LocalityCorridorGridV2 localities={localities} p={p} />

          {/* ── Localities on the map ────────────────────────────────────── */}
          <LocalityMapExplorerV2 localities={localities} basePath={basePath} />

          {/* ── Side-by-side locality intelligence ───────────────────────── */}
          <LocalityCompareTableV2 localities={localities} p={p} />

          {/* ── Infrastructure shaping the next cycle ────────────────────── */}
          <LocalityGrowthCatalystsV2 />

          {/* ── Popular sectors and locality pages ───────────────────────── */}
          <PopularSectorsV2 sectors={sectorFacets} p={p} />
        </>
      )}

    </>
  );
}
