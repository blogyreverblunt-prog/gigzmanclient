import { notFound } from "next/navigation";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import QueryForm from "@/components/site/QueryForm";
import Illustration from "@/components/site/Illustration";
import PremiumV2ContactPage from "@/components/realestate/premium-v2/PremiumV2ContactPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getServices } from "@/lib/content";

export async function generateMetadata(props: PageProps<"/site/[tenant]/contact">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Contact — ${settings?.firmName ?? ""}`,
    description: "Share your requirement. It is reviewed before any engagement is accepted.",
  };
}

export default async function ContactPage(props: PageProps<"/site/[tenant]/contact">) {
  const searchParams = await props.searchParams;
  const preselected = typeof searchParams.service === "string" ? searchParams.service : undefined;

  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2ContactPage tenant={tenant} searchParams={searchParams} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, services] = await Promise.all([
    getFirmSettings(tenant.id),
    getServices(tenant.id),
  ]);
  if (!settings) notFound();

  const addressParts = [
    settings.addressLine,
    settings.locality,
    settings.region,
    settings.postalCode,
  ].filter(Boolean);
  const fullAddress = addressParts.join(", ");

  // Keyless embed — avoids requiring a Maps API key for a static location pin.
  const mapQuery = encodeURIComponent(`${settings.firmName}, ${fullAddress}`);

  return (
    <>
      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <a href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </a>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Contact</span>
        </nav>
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <h1 className="display-xl">Share a concise overview of your requirement.</h1>
            <p className="prose-body mt-5 max-w-2xl text-[15px] sm:text-base">
              The firm will review the requirement and contact you through the method you prefer.
            </p>
          </div>
          <Illustration
            name="documents-shield"
            sizes="(max-width: 1024px) 55vw, 280px"
            className="mx-auto hidden h-auto w-full max-w-[260px] lg:block"
          />
        </div>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[340px_1fr] lg:gap-14">
          <aside className="space-y-4">
            <Card>
              <p className="text-[14px] font-semibold text-ink">Contact details</p>
              <ul className="mt-4 space-y-4">
                {fullAddress ? (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <p className="text-[12px] text-ink-subtle">Office</p>
                      <address className="mt-0.5 text-[13px] not-italic leading-relaxed text-ink-muted">
                        {fullAddress}
                      </address>
                    </div>
                  </li>
                ) : null}
                {settings.phone ? (
                  <li className="flex gap-3">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <p className="text-[12px] text-ink-subtle">Phone</p>
                      <a
                        href={`tel:${settings.phone.replace(/\s/g, "")}`}
                        className="mt-0.5 block py-1 text-[13px] text-ink-muted hover:text-navy"
                      >
                        {settings.phone}
                      </a>
                    </div>
                  </li>
                ) : null}
                {settings.email ? (
                  <li className="flex gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <p className="text-[12px] text-ink-subtle">Email</p>
                      <a
                        href={`mailto:${settings.email}`}
                        className="mt-0.5 block py-1 text-[13px] text-ink-muted hover:text-navy"
                      >
                        {settings.email}
                      </a>
                    </div>
                  </li>
                ) : null}
              </ul>
            </Card>

            {(settings.openingHours ?? []).length > 0 ? (
              <Card>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
                  <p className="text-[14px] font-semibold text-ink">Office hours</p>
                </div>
                <ul className="mt-3.5 space-y-1.5">
                  {(settings.openingHours ?? []).map((hour) => (
                    <li key={hour.day} className="flex justify-between text-[13px]">
                      <span className="text-ink-muted">{hour.day}</span>
                      <span className={hour.closed ? "text-ink-subtle" : "text-ink"}>
                        {hour.closed ? "Closed" : `${hour.opens} – ${hour.closes}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {fullAddress ? (
              <Card padded={false} className="overflow-hidden">
                <iframe
                  title={`Map showing ${settings.firmName}`}
                  src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
                  className="h-[220px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {settings.googleMapsUrl ? (
                  <a
                    href={settings.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border-t border-line px-4 py-3 text-[13px] font-medium text-navy hover:bg-tint"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </Card>
            ) : null}
          </aside>

          <div>
            <div className="rounded-[10px] border border-line p-5 sm:p-7">
              <h2 className="display-md">Discuss your requirement</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                Fields marked with an asterisk are required.
              </p>
              <div className="mt-6">
                <QueryForm
                  services={services.map((s) => ({ slug: s.slug, title: s.title }))}
                  defaultService={preselected}
                  thankYouHref={p("/thank-you")}
                />
              </div>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
