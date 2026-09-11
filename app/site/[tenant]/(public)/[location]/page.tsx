import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Check, ArrowRight } from "lucide-react";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Illustration from "@/components/site/Illustration";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getServices } from "@/lib/content";
import { findLocation, LOCATION_PAGES } from "@/lib/locations";
import { paramsForEachTenant } from "@/lib/static-params";
import { SERVICE_CATEGORY_LABELS } from "@/lib/format";
import {
  buildOrganizationJsonLd,
  buildBreadcrumbJsonLd,
  jsonLdProps,
} from "@/lib/schema-org";

/**
 * The location pages are a fixed list in lib/locations.ts rather than database
 * rows, so the set is identical for every tenant. It still has to be crossed
 * with the tenant list: `generateStaticParams` on a nested dynamic route must
 * return the complete param set including the ancestor’s `tenant`, or nothing
 * prerenders at all.
 *
 * `dynamicParams = false` makes any other path under this catch-all a 404,
 * which is what `findLocation` already did at runtime.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  return paramsForEachTenant(async () =>
    LOCATION_PAGES.map((page) => ({ location: page.slug })),
  );
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/[location]">) {
  const { location: slug } = await props.params;
  const location = findLocation(slug);
  if (!location) return {};

  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  const settings = tenant ? await getFirmSettings(tenant.id) : null;

  const cityLabel = location.alias ? `${location.city} (${location.alias})` : location.city;

  return {
    title: `Chartered Accountant in ${cityLabel} — ${settings?.firmName ?? ""}`,
    description: location.intro.slice(0, 160),
  };
}

export default async function LocationPage(props: PageProps<"/site/[tenant]/[location]">) {
  const { location: slug } = await props.params;
  const location = findLocation(slug);
  if (!location) notFound();

  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, services] = await Promise.all([
    getFirmSettings(tenant.id),
    getServices(tenant.id),
  ]);
  if (!settings) notFound();

  const categories = [...new Set(services.map((s) => s.category))];

  return (
    <>
      {location.isPrimaryOffice ? (
        <script {...jsonLdProps(buildOrganizationJsonLd(settings, p(`/${location.slug}`))) } />
      ) : null}
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: location.city, url: p(`/${location.slug}`) },
          ]),
        )}
      />

      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <Link href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{location.city}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
            {location.city}
          </Badge>
          {location.isPrimaryOffice ? <Badge tone="info">Office location</Badge> : null}
        </div>

        <h1 className="display-xl mt-4 max-w-3xl">{location.headline}</h1>
        <p className="prose-body mt-5 max-w-2xl text-[15px] sm:text-base">{location.intro}</p>

        {location.alias ? (
          <p className="mt-3 text-[13px] text-ink-subtle">
            Also searched as {location.alias}. Both refer to the same city.
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-8">
          <Button href={p("/contact")}>
            Discuss Your Requirement
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Illustration
            name="podium"
            sizes="(max-width: 1024px) 50vw, 240px"
            className="hidden h-auto w-full max-w-[230px] lg:block"
          />
        </div>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px] lg:gap-14">
          <div className="space-y-10">
            <div>
              <h2 className="display-md">Services supported in {location.city}</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {categories.map((category) => {
                  const items = services.filter((s) => s.category === category);
                  return (
                    <Card key={category} href={p(`/services#${category}`)}>
                      <p className="text-[14px] font-semibold text-ink">
                        {SERVICE_CATEGORY_LABELS[category] ?? category}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {items.slice(0, 4).map((item) => (
                          <li
                            key={item.id}
                            className="flex gap-2 text-[13px] leading-relaxed text-ink-muted"
                          >
                            <Check className="mt-1 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                            {item.title}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="display-md">Areas served</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {location.areas.map((area) => (
                  <li
                    key={area}
                    className="rounded-full border border-line bg-tint px-3 py-1.5 text-[13px] text-ink-muted"
                  >
                    {area}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="display-md">Local considerations</h2>
              <ul className="mt-4 space-y-3">
                {location.jurisdictionNotes.map((note) => (
                  <li
                    key={note}
                    className="rounded-[10px] border border-line p-4 text-[13px] leading-relaxed text-ink-muted"
                  >
                    {note}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[12px] leading-relaxed text-ink-subtle">
                These are general observations. Applicability depends on the entity, its places of
                business and the provisions in force.
              </p>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <p className="text-[14px] font-semibold text-ink">Office</p>
              <address className="mt-2.5 text-[13px] not-italic leading-relaxed text-ink-muted">
                {[settings.addressLine, settings.locality, settings.region, settings.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </address>
              {settings.phone ? (
                <a
                  href={`tel:${settings.phone.replace(/\s/g, "")}`}
                  className="mt-3 inline-block py-1 text-[13px] font-medium text-navy hover:underline"
                >
                  {settings.phone}
                </a>
              ) : null}
            </Card>

            <Card>
              <p className="text-[14px] font-semibold text-ink">Other locations</p>
              <ul className="mt-3 space-y-2.5">
                {LOCATION_PAGES.filter((l) => l.slug !== location.slug).map((other) => (
                  <li key={other.slug}>
                    <Link
                      href={p(`/${other.slug}`)}
                      className="inline-block py-1 text-[13px] text-ink-muted hover:text-navy"
                    >
                      {other.city}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>

            <Card tone="navy">
              <p className="text-[14px] font-semibold">Discuss a requirement</p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                Engagements are accepted after the requirement has been reviewed.
              </p>
              <Button href={p("/contact")} variant="onNavy" size="sm" className="mt-4 w-full">
                Submit Requirement
              </Button>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}
