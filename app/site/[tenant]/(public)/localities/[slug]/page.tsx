import { notFound } from "next/navigation";
import Link from "next/link";
import { IndianRupee, TrendingUp, TrendingDown, Percent, Building2 } from "lucide-react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MarketStatRow, { type MarketStat } from "@/components/realestate/MarketStatRow";
import PropertyCard from "@/components/realestate/PropertyCard";
import PremiumV2LocalityDetailPage from "@/components/realestate/premium-v2/PremiumV2LocalityDetailPage";
import { ogFor } from "@/lib/og";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getLocalities, getLocality, getProperties, getPropertyImages } from "@/lib/content";
import { formatIndianPrice, formatDate } from "@/lib/format";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";

/** Prerender every published locality for each tenant. */
export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const rows = await getLocalities(tenant.id);
    return rows.map((row) => ({ slug: row.slug }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/localities/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, locality] = await Promise.all([
    getFirmSettings(tenant.id),
    getLocality(tenant.id, slug),
  ]);
  if (!locality) return {};
  return {
    title: `${locality.name} Real Estate — ${settings?.firmName ?? ""}`,
    description: locality.description ?? undefined,
    ...ogFor({
      title: `${locality.name} — Gurugram corridor guide`,
      description: locality.description ?? undefined,
      image: locality.heroImage,
      path: joinPath(basePathFor(tenant), `/localities/${locality.slug}`),
    }),
  };
}

export default async function LocalityDetailPage(props: PageProps<"/site/[tenant]/localities/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const locality = await getLocality(tenant.id, slug);
  if (!locality) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    const allLocalities = await getLocalities(tenant.id);
    const otherLocalities = allLocalities.filter((l) => l.slug !== locality.slug);
    return (
      <PremiumV2LocalityDetailPage
        clientId={tenant.id}
        locality={locality}
        otherLocalities={otherLocalities}
        p={p}
      />
    );
  }

  const listings = await getProperties(tenant.id, { locality: locality.name });
  const primaryImages = await Promise.all(
    listings.map(async (property) => {
      const images = await getPropertyImages(property.id);
      return images.find((img) => img.isPrimary) ?? images[0] ?? null;
    }),
  );

  const yoy = locality.yoyChangePercent;
  const stats: MarketStat[] = [
    ...(locality.avgPricePerSqft
      ? [{ label: "Avg. price / sq.ft", value: `${formatIndianPrice(locality.avgPricePerSqft)}`, icon: IndianRupee }]
      : []),
    ...(yoy !== null
      ? [
          {
            label: "Year-on-year change",
            value: `${yoy >= 0 ? "+" : ""}${yoy}%`,
            icon: yoy >= 0 ? TrendingUp : TrendingDown,
          },
        ]
      : []),
    ...(locality.rentalYieldPercent !== null
      ? [{ label: "Rental yield", value: `${locality.rentalYieldPercent}%`, icon: Percent }]
      : []),
    ...(locality.activeProjects !== null
      ? [{ label: "Active projects", value: `${locality.activeProjects}`, icon: Building2 }]
      : []),
  ];

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Localities", url: p("/localities") },
            { name: locality.name, url: p(`/localities/${locality.slug}`) },
          ]),
        )}
      />

      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <Link href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={p("/localities")} className="inline-block py-1 hover:text-navy">
            Localities
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{locality.name}</span>
        </nav>

        <h1 className="display-xl max-w-3xl">
          {locality.name}
          {locality.corridor ? (
            <span className="block text-[16px] font-normal text-ink-subtle">{locality.corridor}</span>
          ) : null}
        </h1>

        {locality.description ? (
          <p className="prose-body mt-5 max-w-2xl text-[15px] sm:text-base">{locality.description}</p>
        ) : null}

        {stats.length > 0 ? <MarketStatRow stats={stats} className="mt-8 max-w-2xl" /> : null}

        {locality.lastVerifiedAt ? (
          <p className="mt-4 text-[11px] text-ink-subtle">
            Market figures last verified {formatDate(locality.lastVerifiedAt)}.
          </p>
        ) : null}
      </Section>

      <Section tone="page" size="md">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <h2 className="display-md">Properties in {locality.name}</h2>
          <span className="shrink-0 text-[12px] text-ink-subtle">
            {listings.length} {listings.length === 1 ? "listing" : "listings"}
          </span>
        </div>

        {listings.length === 0 ? (
          <div className="mt-6 rounded-[12px] border border-dashed border-line p-10 text-center">
            <p className="text-[14px] font-medium text-ink">No active listings in {locality.name} right now.</p>
            <div className="mt-4">
              <Button href={p(`/contact?locality=${encodeURIComponent(locality.name)}`)} size="sm">
                Get Notified
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                href={p(`/properties/${property.slug}`)}
                imagePath={primaryImages[i]?.path}
                imageAlt={primaryImages[i]?.alt ?? undefined}
              />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
