import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, LayoutDashboard } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { getClientForPlatform, vastuSectorTenants } from "@/lib/platform/clients";
import { FEATURE_COPY, MANAGED_SOCIAL_KEYS, OPENING_DAYS } from "@/lib/platform/feature-copy";
import { featureEnabled } from "@/lib/features";
import { getVerticalConfig } from "@/lib/verticals";
import { getTemplateConfig, getTenantPath, templateKeyFor } from "@/lib/templates";
import ClientIdentityForm from "@/components/platform/ClientIdentityForm";
import BusinessDetailsForm from "@/components/platform/BusinessDetailsForm";
import FeatureToggles from "@/components/platform/FeatureToggles";
import BrandingPanel from "@/components/platform/BrandingPanel";

/**
 * The per-client edit screen: three independently-saved panels, so a refusal in
 * one does not throw away the operator's edits in another.
 *
 * Everything the Client Components below need is resolved here and passed as
 * plain props — the five feature booleans through `featureEnabled`, the live
 * vastu count, the vertical's registration label, the resolved template label.
 * A Client Component cannot do a lookup, and none of these forms imports lib/db,
 * lib/tenant, lib/content or lib/platform/clients.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client · Gigzman",
  robots: { index: false, follow: false },
};

export default async function ClientEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePlatformAdmin(`/clients/${slug}`);

  const found = await getClientForPlatform(slug);
  if (!found) notFound();
  const { client, settings } = found;

  const vertical = getVerticalConfig(client.vertical);
  const templateKey = templateKeyFor(client);

  // Read-only, and deliberately so: changing `template_key` on a live client
  // changes `data-template` (its whole palette), changes `getTenantPath`, and so
  // changes every URL of its site. With one template in the registry the only
  // reachable edits are "the value it already has" and "a value that 404s the
  // whole site", so there is no control to render. CD-03b sets it at creation.
  const templateLabel =
    client.vertical === "realestate"
      ? templateKey
        ? getTemplateConfig(templateKey).label
        : "Unresolved"
      : "None";
  const templateError =
    client.vertical === "realestate" && !templateKey
      ? "This real-estate client has no template the code can render, so its site has no URL and every page 404s. Set clients.template_key to a registered template."
      : null;

  const basePath = getTenantPath(client);
  const vastuEnabledSlugs = (await vastuSectorTenants())
    .filter((tenant) => tenant.id !== client.id)
    .map((tenant) => tenant.slug);

  const storedHours = settings?.openingHours ?? [];
  const hours = OPENING_DAYS.map((day) => {
    const stored = storedHours.find((row) => row.day === day);
    return {
      day,
      opens: stored?.opens ?? "",
      closes: stored?.closes ?? "",
      closed: stored?.closed ?? false,
    };
  });

  const storedSocial = settings?.socialLinks ?? {};
  const social = Object.fromEntries(
    MANAGED_SOCIAL_KEYS.map((key) => [key, storedSocial[key] ?? ""]),
  ) as Record<(typeof MANAGED_SOCIAL_KEYS)[number], string>;
  const unmanagedSocialKeys = Object.keys(storedSocial).filter(
    (key) => !(MANAGED_SOCIAL_KEYS as readonly string[]).includes(key),
  );

  // `featureEnabled` is the one read path for `clients.features`; the resolved
  // booleans cross to the client as plain props.
  const initialFeatures = Object.fromEntries(
    FEATURE_COPY.map((feature) => [feature.key, featureEnabled(client, feature.key)]),
  );

  return (
    <div className="min-h-screen bg-tint px-5 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All clients
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{vertical.label}</p>
            <h1 className="display-md mt-2">{client.displayName}</h1>
            <p className="mt-1 font-mono text-[12.5px] text-ink-muted">{client.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={basePath}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-muted hover:border-navy hover:text-navy"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Live site
            </a>
            <a
              href={`${basePath}/dashboard`}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-muted hover:border-navy hover:text-navy"
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              Client dashboard
            </a>
          </div>
        </div>

        {!client.isActive ? (
          <p className="mt-4 rounded-[8px] bg-status-danger-soft px-3.5 py-2.5 text-[13px] text-status-danger">
            This client is switched off. Its public pages return 404, its staff cannot sign in, and
            its lead form does not write.
          </p>
        ) : null}

        {/* §10, and CD-09 owns the fix. Noted rather than solved. */}
        <p className="mt-4 rounded-[8px] border border-line bg-surface px-3.5 py-3 text-[12px] leading-relaxed text-ink-muted">
          Edits made here are authoritative. This client&rsquo;s{" "}
          <code className="font-mono">clients/{client.slug}/</code> YAML files are now out of date,
          and <code className="font-mono">pnpm seed:client {client.slug} --force</code> would
          overwrite these edits.
        </p>

        <div className="mt-6 space-y-8">
          <ClientIdentityForm
            clientId={client.id}
            slug={client.slug}
            verticalLabel={vertical.label}
            templateLabel={templateLabel}
            templateError={templateError}
            displayName={client.displayName}
            customDomain={client.customDomain ?? ""}
            isActive={client.isActive}
          />

          {settings ? (
            <BusinessDetailsForm
              clientId={client.id}
              registrationLabel={vertical.footer.registrationLabel}
              reviewsLocked={client.vertical === "cafirm"}
              values={{
                firmName: settings.firmName,
                tagline: settings.tagline ?? "",
                overview: settings.overview ?? "",
                establishedYear: settings.establishedYear ?? "",
                firmRegistrationNumber: settings.firmRegistrationNumber ?? "",
                businessCategory: settings.businessCategory ?? "",
                phone: settings.phone ?? "",
                whatsapp: settings.whatsapp ?? "",
                email: settings.email ?? "",
                notificationEmail: settings.notificationEmail ?? "",
                addressLine: settings.addressLine ?? "",
                locality: settings.locality ?? "",
                region: settings.region ?? "",
                postalCode: settings.postalCode ?? "",
                country: settings.country ?? "",
                latitude: settings.latitude ?? "",
                longitude: settings.longitude ?? "",
                googleMapsUrl: settings.googleMapsUrl ?? "",
              }}
              hours={hours}
              social={social}
              unmanagedSocialKeys={unmanagedSocialKeys}
              sections={{
                reviewsEnabled: settings.reviewsEnabled,
                pricingEnabled: settings.pricingEnabled,
                awardsEnabled: settings.awardsEnabled,
                clientLogosEnabled: settings.clientLogosEnabled,
                teamEnabled: settings.teamEnabled,
              }}
            />
          ) : (
            <p className="rounded-[10px] border border-line bg-surface p-5 text-[13px] text-status-danger">
              This client has no settings row, so there are no business details to edit. Creating
              one is part of the create-client transaction (CD-03b) — inserting a partial row here
              would produce exactly the half-configured client that transaction exists to prevent.
            </p>
          )}

          {settings ? (
            <BrandingPanel
              clientId={client.id}
              firmName={settings.firmName}
              logoUrl={settings.logoUrl}
              iconBaseUrl={settings.iconBaseUrl}
              ogImageUrl={settings.ogImageUrl}
            />
          ) : null}
          {/*
            All five flags gate premium-v2 real-estate surfaces, so there is
            nothing here to configure for another vertical — and one of them,
            `homeLoan`, would publish an "authorised channel partner" claim on a
            site that has no such relationship. `updateClientFeatures` refuses a
            non-realestate row outright; not rendering the panel is the courtesy
            that stops an operator reaching a refusal, not the enforcement.
          */}
          {client.vertical === "realestate" ? (
            <FeatureToggles
              clientId={client.id}
              initial={initialFeatures}
              vastuEnabledSlugs={vastuEnabledSlugs}
            />
          ) : (
            <p className="rounded-[10px] border border-line bg-surface p-5 text-[13px] leading-relaxed text-ink-muted">
              Feature flags apply to the premium-v2 real-estate template only, so this{" "}
              {vertical.label.toLowerCase()} client has none to configure. The home-loan pages in
              particular describe the firm as an authorised channel partner of the lenders they
              name, which is a claim only a real-estate client with a DSA relationship may publish.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
