import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calculator, FileText, Gauge, TrendingUp } from "lucide-react";
import LocalityCard from "@/components/realestate/LocalityCard";
import PropertyTypeIcon from "@/components/realestate/PropertyTypeIcon";
import HeroSearchBar from "@/components/realestate/HeroSearchBar";
import PremiumV2LocalitiesIndexPage from "@/components/realestate/premium-v2/PremiumV2LocalitiesIndexPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import {
  getFirmSettings,
  getLocalities,
  getPropertyLocalityFacets,
  getPropertySectorFacets,
} from "@/lib/content";
import { PROPERTY_TYPE_LABELS } from "@/lib/format";
import { buildBreadcrumbJsonLd, buildItemListJsonLd, jsonLdProps } from "@/lib/schema-org";

export async function generateMetadata(props: PageProps<"/site/[tenant]/localities">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Explore Gurugram by Locality — ${settings?.firmName ?? ""}`,
    description:
      "Locality-wise market snapshots — average price per sq.ft, year-on-year change and rental yield.",
  };
}

const CALCULATORS = [
  { key: "emi", label: "EMI Calculator", detail: "Calculate your monthly home loan EMI.", icon: Calculator },
  { key: "stamp-duty", label: "Stamp Duty Calculator", detail: "Check stamp duty & registration charges.", icon: FileText },
  { key: "rental-yield", label: "Rental Yield Calculator", detail: "Estimate rental return on your investment.", icon: Gauge },
];

export default async function LocalitiesPage(props: PageProps<"/site/[tenant]/localities">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const [localities, localityFacets, sectorFacets] = await Promise.all([
    getLocalities(tenant.id),
    getPropertyLocalityFacets(tenant.id),
    getPropertySectorFacets(tenant.id),
  ]);

  if (templateKeyFor(tenant) === "premium-v2") {
    return (
      <PremiumV2LocalitiesIndexPage
        localities={localities}
        sectorFacets={sectorFacets}
        basePath={basePath}
      />
    );
  }

  const itemListJsonLd = buildItemListJsonLd(
    localities.map((locality) => ({
      name: locality.name,
      url: p(`/localities/${locality.slug}`),
      image: locality.heroImage,
    })),
  );

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
      <section className="relative overflow-hidden bg-navy">
        <Image
          src="/verticals/realestate/photos/hero-localities.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-navy-deep/70 via-navy-deep/40 to-navy-deep/80" />

        <div className="relative mx-auto w-full max-w-7xl px-5 py-14 text-center sm:px-6 sm:py-16 lg:px-8">
          <h1 className="display-xl text-white">Explore Gurugram, sector by sector.</h1>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white/75 sm:text-base">
            Discover neighbourhoods. Compare. Decide with confidence.
          </p>
          <div className="mx-auto mt-8 max-w-2xl text-left">
            <HeroSearchBar action={p("/properties")} localities={localityFacets} />
          </div>
        </div>
      </section>

      {/* ── Corridors ──────────────────────────────────────────────────── */}
      <section className="border-b border-line bg-tint">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
          <h2 className="display-md">Browse Gurugram by Corridor</h2>

          {localities.length === 0 ? (
            <div className="mt-6 rounded-[12px] border border-dashed border-line p-10 text-center">
              <p className="text-[14px] font-medium text-ink">Locality pages are being added.</p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {localities.map((locality) => (
                <LocalityCard key={locality.id} locality={locality} href={p(`/localities/${locality.slug}`)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Browse by property type ────────────────────────────────────── */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
          <h2 className="display-md text-center">Browse by Property Type</h2>
          <div className="mt-7 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
              <Link
                key={value}
                href={p(`/properties?type=${value}`)}
                className="flex flex-col items-center gap-2.5 rounded-[10px] border border-line p-4 text-center hover:border-accent-ring"
              >
                <PropertyTypeIcon propertyType={value} boxed boxClassName="h-11 w-11 rounded-[9px] bg-tint" />
                <p className="text-[12px] font-medium text-ink">{label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Useful tools ───────────────────────────────────────────────── */}
      <section className="border-b border-line bg-tint">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
          <h2 className="display-md text-center">Useful Tools</h2>
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CALCULATORS.map((calc) => {
              const Icon = calc.icon;
              return (
                <Link
                  key={calc.key}
                  href={p(`/calculators/${calc.key}`)}
                  className="flex items-start gap-3 rounded-[10px] border border-line bg-surface p-5 hover:border-accent-ring"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">{calc.label}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-subtle">{calc.detail}</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-navy">
                      Calculate now
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <section className="bg-navy">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 px-5 py-12 text-center sm:px-6 lg:px-8">
          <h2 className="display-lg text-white">Get a personalised locality report</h2>
          <p className="max-w-md text-[14px] text-white/70">
            Price trends, top projects, rental yield &amp; more — delivered to you.
          </p>
          <Link
            href={p("/contact")}
            className="mt-2 inline-flex min-h-[46px] items-center gap-2 rounded-[8px] bg-accent px-6 text-[14px] font-medium text-white hover:bg-accent-hover"
          >
            Get My Report
          </Link>
        </div>
      </section>
    </>
  );
}
