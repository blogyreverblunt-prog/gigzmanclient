import { notFound } from "next/navigation";
import Link from "next/link";
import { BedDouble, Bath, Ruler, MapPin, ShieldCheck, ShieldAlert, Building2, Check } from "lucide-react";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import PropertyGallery from "@/components/realestate/PropertyGallery";
import PremiumV2PropertyDetailPage from "@/components/realestate/premium-v2/PremiumV2PropertyDetailPage";
import { ogFor } from "@/lib/og";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getProperty, getPropertyImages, getProperties } from "@/lib/content";
import {
  formatIndianPrice,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_PURPOSE_LABELS,
} from "@/lib/format";
import {
  buildBreadcrumbJsonLd,
  buildPropertyListingJsonLd,
  jsonLdProps,
} from "@/lib/schema-org";

/**
 * Declaring `generateStaticParams` marks this route SSG. When the param set is
 * empty (PRERENDER unset) Next still renders it through the static path, which
 * the parent layout’s `revalidate = 300` turns into ISR — and this page’s tree
 * throws DYNAMIC_SERVER_USAGE there, 500ing every listing. Forcing dynamic
 * rendering puts it on the same path as /calculators/[key], which works.
 *
 * It has to be a literal — Next rejects a computed `dynamic` field outright
 * ("needs to be a static string"), so this cannot be conditioned on PRERENDER.
 * The consequence is worth knowing before a production build: with this set,
 * `generateStaticParams` below is ignored and listings are never prerendered,
 * even under PRERENDER=full. Restoring that means first finding the dynamic
 * API in this page’s tree that ISR rejects — it is not `searchParams`, which
 * this page does not read.
 */
export const dynamic = "force-dynamic";

/** Prerenders every active listing for each tenant. */
export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const rows = await getProperties(tenant.id, {});
    return rows.map((row) => ({ slug: row.slug }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/properties/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, property] = await Promise.all([
    getFirmSettings(tenant.id),
    getProperty(tenant.id, slug),
  ]);
  if (!property) return {};
  // The listing's own primary photo becomes the share card, so replacing the
  // photo in the dashboard changes the WhatsApp preview with no extra step.
  const images = await getPropertyImages(property.id);
  const primary = images.find((i) => i.isPrimary) ?? images[0] ?? null;

  return {
    title: `${property.title} — ${settings?.firmName ?? ""}`,
    description: property.description ?? undefined,
    ...ogFor({
      title: property.title,
      description: property.description ?? undefined,
      image: primary?.path,
      path: joinPath(basePathFor(tenant), `/properties/${property.slug}`),
      type: "article",
    }),
  };
}

export default async function PropertyDetailPage(props: PageProps<"/site/[tenant]/properties/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, property] = await Promise.all([
    getFirmSettings(tenant.id),
    getProperty(tenant.id, slug),
  ]);
  if (!property || !settings) notFound();

  const images = await getPropertyImages(property.id);
  const primaryImage = images.find((img) => img.isPrimary) ?? images[0] ?? null;

  const listingJsonLd = buildPropertyListingJsonLd({
    title: property.title,
    description: property.description,
    url: p(`/properties/${property.slug}`),
    image: primaryImage?.path ?? null,
    price: property.price,
    purpose: property.purpose,
    locality: property.locality,
    region: settings.region ?? undefined,
    country: settings.country ?? undefined,
  });

  const jsonLdScripts = (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Properties", url: p("/properties") },
            { name: property.title, url: p(`/properties/${property.slug}`) },
          ]),
        )}
      />
      <script {...jsonLdProps(listingJsonLd)} />
    </>
  );

  if (templateKeyFor(tenant) === "premium-v2") {
    // Same-locality matches first, falling back to same-property-type when
    // there aren't enough of those (a niche locality can otherwise surface
    // zero "Similar Properties").
    const MIN_SIMILAR = 3;
    const byLocality = property.locality
      ? await getProperties(tenant.id, { locality: property.locality, limit: 8 })
      : [];
    let similarMatches = byLocality.filter((item) => item.id !== property.id);
    if (similarMatches.length < MIN_SIMILAR) {
      const byType = await getProperties(tenant.id, { propertyType: property.propertyType, limit: 8 });
      const seen = new Set(similarMatches.map((item) => item.id));
      for (const item of byType) {
        if (item.id === property.id || seen.has(item.id)) continue;
        similarMatches.push(item);
        seen.add(item.id);
      }
    }
    similarMatches = similarMatches.slice(0, 4);

    const similarProperties = await Promise.all(
      similarMatches.map(async (item) => {
        const itemImages = await getPropertyImages(item.id);
        const primary = itemImages.find((img) => img.isPrimary) ?? itemImages[0] ?? null;
        return { property: item, imagePath: primary?.path, imageAlt: primary?.alt ?? undefined };
      }),
    );

    return (
      <>
        {jsonLdScripts}
        <PremiumV2PropertyDetailPage
          tenant={tenant}
          property={property}
          images={images}
          settings={settings}
          similarProperties={similarProperties}
          basePath={basePath}
        />
      </>
    );
  }

  const sameLocality = property.locality
    ? await getProperties(tenant.id, { locality: property.locality, limit: 8 })
    : [];
  const related = sameLocality.filter((item) => item.id !== property.id).slice(0, 3);

  const priceDisplay =
    property.priceLabel || (property.price ? formatIndianPrice(property.price) : null);
  const locationLine = [property.locality, property.sector ? `Sector ${property.sector}` : null]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {jsonLdScripts}

      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <Link href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={p("/properties")} className="inline-block py-1 hover:text-navy">
            Properties
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{property.title}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{PROPERTY_STATUS_LABELS[property.status] ?? property.status}</Badge>
          <Badge tone="info">{PROPERTY_PURPOSE_LABELS[property.purpose] ?? property.purpose}</Badge>
          {property.badge ? <Badge tone="info">{property.badge}</Badge> : null}
        </div>

        <h1 className="display-xl mt-4 max-w-3xl">{property.title}</h1>
        {locationLine ? (
          <p className="mt-3 flex items-center gap-1.5 text-[14px] text-ink-muted">
            <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {locationLine}
          </p>
        ) : null}

        <p className="mt-5 font-display text-[28px] font-medium text-accent">
          {priceDisplay ?? "Price on request"}
          {property.purpose === "rent" ? (
            <span className="ml-1 text-[14px] font-normal text-ink-subtle">/ month</span>
          ) : null}
        </p>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px] lg:gap-14">
          <div className="space-y-10">
            <PropertyGallery
              images={images.map((img) => ({ path: img.path, alt: img.alt }))}
              propertyType={property.propertyType}
              title={property.title}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {property.beds ? (
                <div className="rounded-[10px] border border-line bg-surface p-3.5 text-center">
                  <BedDouble className="mx-auto h-4 w-4 text-accent" aria-hidden="true" />
                  <p className="mt-2 text-[14px] font-medium text-ink">{property.beds} BHK</p>
                  <p className="text-[11px] text-ink-subtle">Bedrooms</p>
                </div>
              ) : null}
              {property.baths ? (
                <div className="rounded-[10px] border border-line bg-surface p-3.5 text-center">
                  <Bath className="mx-auto h-4 w-4 text-accent" aria-hidden="true" />
                  <p className="mt-2 text-[14px] font-medium text-ink">{property.baths}</p>
                  <p className="text-[11px] text-ink-subtle">Bathrooms</p>
                </div>
              ) : null}
              {property.area ? (
                <div className="rounded-[10px] border border-line bg-surface p-3.5 text-center">
                  <Ruler className="mx-auto h-4 w-4 text-accent" aria-hidden="true" />
                  <p className="mt-2 text-[14px] font-medium text-ink">
                    {property.area} {property.areaUnit}
                  </p>
                  <p className="text-[11px] text-ink-subtle">Area</p>
                </div>
              ) : null}
              <div className="rounded-[10px] border border-line bg-surface p-3.5 text-center">
                <Building2 className="mx-auto h-4 w-4 text-accent" aria-hidden="true" />
                <p className="mt-2 text-[14px] font-medium text-ink">
                  {PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType}
                </p>
                <p className="text-[11px] text-ink-subtle">Type</p>
              </div>
            </div>

            {property.description ? (
              <div>
                <h2 className="display-md">About this property</h2>
                <p className="prose-body mt-4 text-[14px] leading-relaxed sm:text-[15px]">
                  {property.description}
                </p>
              </div>
            ) : null}

            {property.amenities && property.amenities.length > 0 ? (
              <div>
                <h2 className="display-md">Amenities</h2>
                <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {property.amenities.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-muted">
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {property.specs && Object.keys(property.specs).length > 0 ? (
              <div>
                <h2 className="display-md">Specifications</h2>
                <dl className="mt-4 divide-y divide-line rounded-[10px] border border-line">
                  {Object.entries(property.specs).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4 px-4 py-3 text-[13px]">
                      <dt className="text-ink-muted">{key}</dt>
                      <dd className="text-right font-medium text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="rounded-[10px] bg-accent-soft p-5 sm:p-6">
              {property.reraNumber ? (
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
                  <div>
                    <p className="text-[14px] font-semibold text-ink">RERA registered</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                      Registration number: {property.reraNumber}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden="true" />
                  <div>
                    <p className="text-[14px] font-semibold text-ink">Registration pending</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                      This project&rsquo;s RERA registration number has not been published yet. Treat
                      this listing as provisional until it is available.
                    </p>
                  </div>
                </div>
              )}
              {property.developer ? (
                <p className="mt-3 text-[12px] text-ink-subtle">Developer: {property.developer}</p>
              ) : null}
            </div>

            <p className="border-t border-line pt-5 text-[12px] leading-relaxed text-ink-subtle">
              Carpet area, price and possession timeline are indicative and subject to confirmation
              and change by the developer and the relevant authority.
            </p>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card tone="navy">
              <p className="text-[14px] font-semibold">Interested in this property?</p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">
                Share your requirement and the team will get back with availability and site-visit
                slots.
              </p>
              <Button
                href={p(`/contact?property=${property.slug}`)}
                variant="onNavy"
                size="sm"
                className="mt-4 w-full"
              >
                Enquire Now
              </Button>
            </Card>

            {related.length > 0 ? (
              <Card>
                <p className="text-[14px] font-semibold text-ink">More in {property.locality}</p>
                <div className="mt-3.5 space-y-3">
                  {related.map((item) => (
                    <Link
                      key={item.id}
                      href={p(`/properties/${item.slug}`)}
                      className="block rounded-[8px] border border-line p-3 hover:border-accent-ring"
                    >
                      <p className="text-[13px] font-medium leading-snug text-ink">{item.title}</p>
                      <p className="mt-1 text-[12px] text-accent">
                        {item.priceLabel || (item.price ? formatIndianPrice(item.price) : "Price on request")}
                      </p>
                    </Link>
                  ))}
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
      </Section>
    </>
  );
}
