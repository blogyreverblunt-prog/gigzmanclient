import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/site/SiteHeader";
import RealEstateSiteHeader from "@/components/realestate/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import HeaderV2 from "@/components/realestate/premium-v2/HeaderV2";
import FooterV2 from "@/components/realestate/premium-v2/FooterV2";
import ConsultationCtaV2 from "@/components/realestate/premium-v2/ConsultationCtaV2";
import ScrollLeadPopupV2 from "@/components/realestate/premium-v2/ScrollLeadPopupV2";
import ScrollDepthTracker from "@/components/realestate/premium-v2/ScrollDepthTracker";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import { iconsFor } from "@/lib/brand-icons";
import { originFor } from "@/lib/og";
import CallbackFloatV2 from "@/components/realestate/premium-v2/CallbackFloatV2";
import WhatsAppFloatV2 from "@/components/realestate/premium-v2/WhatsAppFloatV2";
import MobileActionBarV2 from "@/components/realestate/premium-v2/MobileActionBarV2";
import AnnouncementBar from "@/components/site/AnnouncementBar";
import CompliancePopup from "@/components/site/CompliancePopup";
import WhatsAppFloat from "@/components/site/WhatsAppFloat";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { toolLinksFor } from "@/lib/premium-v2/tools";
import { homeLoanEnabled } from "@/lib/home-loan/enabled";
import { getFirmSettings, getNextDeadline, getServices } from "@/lib/content";
import { buildOrganizationJsonLd, jsonLdProps } from "@/lib/schema-org";
import { deadlineInstant, daysUntil, formatDate } from "@/lib/format";
import { getVerticalConfig } from "@/lib/verticals";

/**
 * Revalidated rather than re-rendered per request. Combined with taking the
 * tenant from `params` instead of `headers()`, this is what lets the public
 * site be served from cache — reading a dynamic API anywhere in this subtree
 * would opt the whole thing back into per-request rendering.
 */
export const revalidate = 300;

/**
 * Layout-level metadata so the tenant's favicon covers every public page
 * beneath it. Page-level `generateMetadata` overrides title and description
 * but leaves `icons` in place, which is the behaviour wanted here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const row = await getTenantBySlug(tenant);
  // The icon set and the share-image override both live on `firm_settings`
  // since CD-05, so this needs the settings row as well as the client row.
  const settings = row ? await getFirmSettings(row.id) : null;
  return {
    // Required for Open Graph: relative image paths in page metadata are
    // resolved against this, and OG requires absolute URLs.
    metadataBase: originFor(row?.customDomain),
    icons: iconsFor(settings?.iconBaseUrl),
    // An uploaded share image replaces the generated card for every page of
    // this tenant. Left unset, `opengraph-image.tsx` composes one from the
    // logo and settings, which is the better default — this is the escape
    // hatch for a client who has had one designed.
    ...(settings?.ogImageUrl
      ? {
          openGraph: {
            images: [{ url: settings.ogImageUrl, width: 1200, height: 630 }],
          },
        }
      : {}),
  };
}


export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const [settings, deadline, services] = await Promise.all([
    getFirmSettings(tenant.id),
    getNextDeadline(tenant.id),
    getServices(tenant.id),
  ]);

  if (!settings) notFound();

  const p = (path: string) => joinPath(basePath, path);
  const vertical = getVerticalConfig(tenant.vertical);

  // Children are resolved here too: a grouping entry renders as a dropdown in
  // the header and as a labelled block in the mobile sheet.
  const navItems = vertical.nav.map((item) => ({
    label: item.label,
    href: p(item.path),
    ...(item.children
      ? {
          children: item.children.map((child) => ({
            label: child.label,
            href: p(child.path),
            icon: child.icon,
            badge: child.badge,
          })),
        }
      : {}),
  }));

  const categories = [...new Set(services.map((s) => s.category))];
  const effectiveDate = deadline ? (deadline.extendedDueDate ?? deadline.dueDate) : null;
  // One lookup feeding both uses below. `data-template` selects this tenant's
  // entire palette in app/globals.css, so it and the branch that renders
  // premium-v2 chrome must not be able to disagree.
  const templateKey = templateKeyFor(tenant);
  const isPremiumV2 = templateKey === "premium-v2";

  return (
    // Theme scope. These attributes used to sit on <html> in the root layout,
    // which forced every route in the app to be dynamically rendered. Custom
    // properties inherit, so scoping them here themes the whole tenant tree
    // identically while leaving the root layout static.
    <div
      data-vertical={tenant.vertical}
      data-template={templateKey}
      className="flex min-h-full flex-1 flex-col"
    >
      <script
        {...jsonLdProps(buildOrganizationJsonLd(settings, basePath || "/", vertical.schemaType))}
      />

      {deadline && effectiveDate ? (
        <AnnouncementBar
          title={deadline.title}
          dueDate={deadline.dueDate}
          extendedDueDate={deadline.extendedDueDate}
          href={p("/compliance-calendar")}
        />
      ) : null}

      {/* gtag.js for this tenant's own GA4 property. Rendered here so it
          covers every public page in one place. */}
      <GoogleAnalytics measurementId={settings.ga4MeasurementId ?? ""} />

      {isPremiumV2 ? (
        // HeaderV2 reads useSearchParams() to highlight the active nav item
        // (Buy/Rent/Commercial all point at /properties with different
        // params). That hook opts the whole route out of static rendering
        // unless it sits behind a Suspense boundary — with one, the shell
        // prerenders and the header resolves its active state on the client.
        <Suspense fallback={<div className="h-[88px] lg:h-[104px]" />}>
          <HeaderV2
            firmName={settings.firmName}
            logoUrl={settings.logoUrl ?? ""}
            phone={settings.phone}
            basePath={basePath || "/"}
            navItems={navItems}
            toolLinks={[
              ...toolLinksFor(tenant).map((tool) => ({
                label: tool.label,
                path: tool.path,
                icon: tool.icon,
              })),
              { label: "All Calculators", path: "/calculators", icon: "Calculator" },
            ]}
          />
        </Suspense>
      ) : vertical.id === "realestate" ? (
        <RealEstateSiteHeader
          firmName={settings.firmName}
          logoUrl={settings.logoUrl}
          basePath={basePath || "/"}
          phone={settings.phone}
          whatsapp={settings.whatsapp}
          navItems={navItems}
          contactHref={p("/contact")}
        />
      ) : (
        <SiteHeader
          firmName={settings.firmName}
          descriptor={settings.businessCategory}
          logoUrl={settings.logoUrl}
          basePath={basePath || "/"}
          phone={settings.phone}
          navItems={navItems}
          contactHref={p("/contact")}
          vertical={vertical.id}
        />
      )}

      {/* HeaderV2 is `fixed`, so every premium-v2 page (home included, now
          that HeroV2 no longer carries its own top padding) needs this
          clearance or its first section renders underneath the header.
          Pinned to HeaderV2's exact measured height (88px mobile / 104px
          lg+, from its py-4/py-5 + h-14/h-16 logo) rather than a rounder
          Tailwind step — pt-28/pt-32 (112px/128px) left a 24px gap where a
          dark first section (e.g. Updates/Localities) showed the page's own
          background as a visible strip under the header. */}
      <main className={isPremiumV2 ? "flex-1 pt-[88px] lg:pt-[104px]" : "flex-1"}>{children}</main>

      {/* Closing CTA. Rendered here rather than per page so every route in the
          template ends on the same photographed consultation band directly
          above the footer — pages used to opt in individually, which left
          roughly half of them (properties, localities, calculators, updates,
          legal, careers) ending on a bare section edge. */}
      {isPremiumV2 ? <ConsultationCtaV2 phone={settings.phone} /> : null}

      {isPremiumV2 ? (
        <FooterV2 settings={settings} basePath={basePath || "/"} homeLoanEnabled={homeLoanEnabled(tenant)} />
      ) : (
        <SiteFooter
          settings={settings}
          basePath={basePath}
          categories={categories}
          vertical={vertical}
        />
      )}

      {settings.whatsapp && !isPremiumV2 ? (
        <WhatsAppFloat number={settings.whatsapp} firmName={settings.firmName} />
      ) : null}

      {isPremiumV2 ? (
        <>
          {settings.whatsapp ? (
            <WhatsAppFloatV2 number={settings.whatsapp} firmName={settings.firmName} />
          ) : null}
          <MobileActionBarV2
            phone={settings.phone}
            whatsapp={settings.whatsapp}
            firmName={settings.firmName}
            googleMapsUrl={settings.googleMapsUrl}
          />
          <CallbackFloatV2 />
          <ScrollLeadPopupV2 basePath={basePath || "/"} />
          {/* Site-wide scroll milestones. Individual pages that want a more
              specific page_type (plot maps, the maps index) render their own
              tracker; the milestone set is deduped per path either way. */}
          <ScrollDepthTracker pageType="site" />
        </>
      ) : null}

      {deadline && effectiveDate ? (
        <CompliancePopup
          deadlineId={deadline.id}
          title={deadline.title}
          effectiveDate={formatDate(effectiveDate)}
          targetIso={deadlineInstant(effectiveDate).toISOString()}
          daysRemaining={daysUntil(effectiveDate)}
          href={p("/compliance-calendar")}
        />
      ) : null}
    </div>
  );
}
