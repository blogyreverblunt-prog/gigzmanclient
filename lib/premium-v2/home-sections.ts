import { featureEnabled, type FeatureHost } from "@/lib/features";

/**
 * Per-tenant switches for optional premium-v2 homepage sections.
 *
 * The template is shared by every premium-v2 client, so a section a single
 * client does not want cannot simply be deleted from the composition — it has
 * to be gated. These were `Set<string>` allowlists in this file until CD-02;
 * the answer now lives on `clients.features`, so which sections a client
 * publishes is data an operator can change rather than a source edit and a
 * deploy. The helpers keep their names, this file and their **synchronous**
 * signatures — two of them are evaluated inline in `PremiumV2Home`'s JSX, and
 * the third gates `(public)/property-management`'s `generateMetadata` and its
 * page body — and take the tenant row instead of a slug, so a gate can only be
 * answered from the row being rendered.
 *
 * Unlike the two sibling gate modules, nothing in this file is read by
 * `lib/sitemap.ts` or by any `generateStaticParams`.
 *
 * The polarity is deliberately not uniform: `propertyMap` is opt-OUT
 * (default true) and the two property-management flags are opt-IN (default
 * false). Each reason is on its accessor below; the defaults themselves are
 * declared once in `FEATURE_DEFAULTS` in `lib/features.ts`.
 */

/**
 * "Explore Properties on the Map" is a styled placeholder, not a working map:
 * decorative pins on a textured panel and map/satellite toggles that switch
 * nothing, pending the real Maps JS API. High Properties is a live client on
 * its own domain and asked for it off; the other tenants keep it until it is
 * either wired to a real map or dropped everywhere.
 *
 * Gate: `clients.features.propertyMap`, opt-**out** — default **true**, so a
 * tenant created with `{}` gets the section, which is what four of the five
 * live tenants want. Reading this as an allowlist and inverting it would
 * silently strip the section from those four sites, and the home page would
 * still render, so nothing would fail loudly.
 *
 * This comment is the source for this flag's on-screen helper text in
 * `lib/platform/feature-copy.ts`, rendered by
 * `components/platform/FeatureToggles.tsx`.
 */
export function propertyMapSectionEnabled(tenant: FeatureHost | null | undefined): boolean {
  return featureEnabled(tenant, "propertyMap");
}

/**
 * The property-management section's artwork is not tenant-neutral: the phone
 * mock, its screen and the logo on it are baked into the supplied background
 * images, so it reads as High Properties whoever renders it. Opt-in rather
 * than opt-out for that reason — a second client gets the section when there
 * is art carrying their own brand, not before.
 *
 * Gate: `clients.features.propertyManagementSection`, default **false**.
 *
 * This comment is the source for this flag's on-screen helper text in
 * `lib/platform/feature-copy.ts`, rendered by
 * `components/platform/FeatureToggles.tsx`.
 */
export function propertyManagementSectionEnabled(tenant: FeatureHost | null | undefined): boolean {
  return featureEnabled(tenant, "propertyManagementSection");
}

/**
 * The property-management landing page ships with High-Properties-branded
 * art throughout — the hero phone and its screen, the inspector's uniform,
 * the owner-portal reference — so it is opt-in rather than opt-out, on the
 * same reasoning as the home page's management section.
 *
 * Gate: `clients.features.propertyManagementPage`, default **false**. Off,
 * `/property-management` is a real 404 for that tenant rather than an empty
 * page.
 *
 * This comment is the source for this flag's on-screen helper text in
 * `lib/platform/feature-copy.ts`, rendered by
 * `components/platform/FeatureToggles.tsx`.
 */
export function propertyManagementPageEnabled(tenant: FeatureHost | null | undefined): boolean {
  return featureEnabled(tenant, "propertyManagementPage");
}
