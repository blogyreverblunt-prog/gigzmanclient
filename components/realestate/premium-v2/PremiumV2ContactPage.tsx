import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import QueryFormV2 from "./QueryFormV2";
import MapEmbedV2 from "./MapEmbedV2";
import WhatsAppIconV2 from "./WhatsAppIconV2";
import ContactChannelsV2 from "./ContactChannelsV2";
import ContactAdvisorsCompactV2 from "./ContactAdvisorsCompactV2";
import ContactFollowUpV2 from "./ContactFollowUpV2";
import ContactFaqV2 from "./ContactFaqV2";
import { whatsappHref } from "@/lib/whatsapp";
import { GpContainer, GpEyebrow, GpSection } from "./gp-primitives";
import { basePathFor, joinPath, type Tenant } from "@/lib/tenant";
import { getFirmSettings, getServices } from "@/lib/content";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";

/** A building shot rather than the earlier desk/blueprint close-up — this
 *  column now sits beside the form on the first screen, where a recognisable
 *  property image reads better than a document detail. */
const IMAGE = "/verticals/realestate/templates/premium-v2/images/hero-curated-inventory-v2.png";

export default async function PremiumV2ContactPage({
  tenant,
  searchParams,
}: {
  tenant: Tenant;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const preselected = typeof searchParams.service === "string" ? searchParams.service : undefined;

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, services] = await Promise.all([
    getFirmSettings(tenant.id),
    getServices(tenant.id),
  ]);
  if (!settings) notFound();

  const addressParts = [settings.addressLine, settings.locality, settings.region, settings.postalCode].filter(
    Boolean,
  );
  const fullAddress = addressParts.join(", ");
  // Exact pin from the client's listing; see MapEmbedV2 on why the address
  // string alone is not enough.
  const mapCoordinates =
    settings.latitude && settings.longitude ? `${settings.latitude},${settings.longitude}` : null;
  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s/g, "")}` : null;
  const waLink = whatsappHref(settings.whatsapp, settings.country);

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Contact", url: p("/contact") },
          ]),
        )}
      />

      {/* Heading sits inside the form column rather than in its own full-width
          band above — that band pushed the form itself below the fold, so the
          first screen showed only a title. Now the form is visible on open,
          with the building image beside it. */}
      <GpSection tone="cream" className="pb-20 pt-10 sm:pb-28 sm:pt-12">
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-[color:var(--gp-muted)]">
            <Link href={p("/")} className="inline-block py-1 hover:text-[color:var(--gp-gold-600)]">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <span>Contact</span>
          </nav>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
            <div>
              <GpEyebrow>Get In Touch</GpEyebrow>
              <h1 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
                Share a concise overview of your requirement.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[color:var(--gp-body)]">
                An advisor reviews every enquiry and responds through the method you prefer —
                phone, WhatsApp or email.
              </p>

              <div
                className="mt-8 rounded-[var(--gp-radius-lg)] border border-white/60 p-6 sm:p-10"
                style={{ background: "var(--gp-gradient-glass)", boxShadow: "var(--shadow-raised)" }}
              >
                <h2 className="font-display text-[18px] text-[color:var(--gp-ink)] sm:text-[21px]">
                  Discuss your requirement
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--gp-muted)]">
                  Fields marked with an asterisk are required.
                </p>
                <div className="mt-7">
                  <QueryFormV2
                    services={services.map((s) => ({ slug: s.slug, title: s.title }))}
                    defaultService={preselected}
                    thankYouHref={p("/thank-you")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--gp-radius-lg)] sm:aspect-[3/4]">
                <Image
                  src={IMAGE}
                  alt="Premium residential development in Gurugram"
                  fill
                  sizes="(max-width: 1024px) 100vw, 420px"
                  className="object-cover"
                />
                <div className="absolute inset-0" style={{ background: "var(--gp-gradient-card)" }} />

                <div className="absolute inset-x-0 bottom-0 space-y-3.5 p-5 sm:p-6">
                  {fullAddress ? (
                    <div className="flex gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                      <div>
                        <p className="gp-eyebrow text-[color:var(--gp-gold-300)]">Office</p>
                        <address className="mt-0.5 text-[13px] not-italic leading-relaxed text-white/90">
                          {fullAddress}
                        </address>
                      </div>
                    </div>
                  ) : null}

                  {settings.phone ? (
                    <div className="flex gap-3">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                      <div>
                        <p className="gp-eyebrow text-[color:var(--gp-gold-300)]">Phone</p>
                        {telHref ? (
                          <a href={telHref} className="mt-0.5 block py-0.5 text-[13px] text-white/90 hover:text-white">
                            {settings.phone}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {settings.email ? (
                    <div className="flex gap-3">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                      <div>
                        <p className="gp-eyebrow text-[color:var(--gp-gold-300)]">Email</p>
                        <a
                          href={`mailto:${settings.email}`}
                          className="mt-0.5 block py-0.5 text-[13px] text-white/90 hover:text-white"
                        >
                          {settings.email}
                        </a>
                      </div>
                    </div>
                  ) : null}

                  {waLink ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex min-h-[42px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-4 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
                    >
                      <WhatsAppIconV2 className="h-3.5 w-3.5" />
                      WhatsApp Us
                    </a>
                  ) : null}
                </div>
              </div>

              {(settings.openingHours ?? []).length > 0 ? (
                <div className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white/70 p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[color:var(--gp-gold-600)]" aria-hidden="true" />
                    <p className="text-[13.5px] font-semibold text-[color:var(--gp-ink)]">Office hours</p>
                  </div>
                  <ul className="mt-3.5 space-y-1.5">
                    {(settings.openingHours ?? []).map((hour) => (
                      <li key={hour.day} className="flex justify-between text-[13px]">
                        <span className="text-[color:var(--gp-body)]">{hour.day}</span>
                        <span
                          className={
                            hour.closed
                              ? "text-[color:var(--gp-muted)]"
                              : "font-medium text-[color:var(--gp-ink)]"
                          }
                        >
                          {hour.closed ? "Closed" : `${hour.opens} – ${hour.closes}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {fullAddress ? (
                <div>
                  <MapEmbedV2 address={fullAddress} coordinates={mapCoordinates} />
                  {settings.googleMapsUrl ? (
                    <a
                      href={settings.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white/70 text-[13px] font-medium text-[color:var(--gp-ink)] transition-colors hover:border-[color:var(--gp-gold-600)] hover:text-[color:var(--gp-gold-600)]"
                    >
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </GpContainer>
      </GpSection>

      <ContactChannelsV2
        telHref={telHref}
        calculatorsHref={p("/calculators")}
        rentalsHref={p("/properties?purpose=rent")}
        updatesHref={p("/updates")}
      />

      <ContactAdvisorsCompactV2
        phone={settings.phone}
        whatsapp={settings.whatsapp} country={settings.country}
        advisorsHref={`${p("/")}#advisors`}
      />

      <ContactFollowUpV2 />

      <ContactFaqV2 />

    </>
  );
}
