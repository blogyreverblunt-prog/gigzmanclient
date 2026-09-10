import type { Metadata } from "next";
import { ICON_SIZES } from "@/lib/brand-images";

/**
 * Per-tenant favicons.
 *
 * A single `app/icon.png` would apply to every tenant on the shared
 * deployment, so each client's set is attached through the tenant layout's
 * `generateMetadata` instead.
 *
 * The set used to be a hardcoded `ICON_SETS` map keyed by slug, which could
 * only ever describe a client someone had edited this file for — exactly one
 * did. It is now `firm_settings.icon_base_url`, generated from the uploaded
 * logo, so onboarding a client no longer means a code edit here.
 *
 * A tenant with no value gets the app default. It must never inherit another
 * client's mark, which is why the fallback is `undefined` rather than any
 * other tenant's path.
 *
 * `ICON_SIZES` is shared with the generator in lib/brand-images.ts so the sizes
 * advertised here cannot drift from the sizes actually written: 32 is the tab
 * icon, 180 the iOS home-screen icon, 192 and 512 the PWA sizes Android uses.
 */
export function iconsFor(iconBaseUrl: string | null | undefined): Metadata["icons"] {
  if (!iconBaseUrl) return undefined;

  const [tab, apple, ...pwa] = ICON_SIZES;
  return {
    icon: [tab, ...pwa].map((size) => ({
      url: `${iconBaseUrl}-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
    apple: [{ url: `${iconBaseUrl}-${apple}.png`, sizes: `${apple}x${apple}`, type: "image/png" }],
  };
}
