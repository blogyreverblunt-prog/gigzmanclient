import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The homepage share card reads its background off disk at generation time.
  // Files under public/ are served statically but are not traced into a
  // function's bundle, so it has to be named explicitly or the card renders
  // without its photograph.
  outputFileTracingIncludes: {
    "/site/[tenant]/(public)/opengraph-image": ["./public/brand/og-hero.jpg"],
  },
  images: {
    /**
     * Every `quality` value any `next/image` in this app passes.
     *
     * Next 16 will not honour a quality that is not declared here: it warns
     * once per image and falls back to the default, so the setting silently
     * does nothing. Nothing breaks and no build fails, which is exactly why it
     * went unnoticed — the only symptom was a wall of warnings in the dev log.
     *
     * Keep this in step with the call sites. There are two:
     *   68 — `components/realestate/premium-v2/maps/MapsCarouselV2.tsx`
     *   70 — `app/site/[tenant]/(public)/maps/gurgaon/page.tsx`
     * 75 is Next's own default and is listed so that dropping either of the
     * above does not change the default's behaviour.
     */
    qualities: [68, 70, 75],

    // Only ever true for static, locally-bundled SVGs we sourced ourselves
    // (developer partner logos) — never for user-supplied or remote SVGs.
    // Next's own recommended-safe combination: sandboxed + no inline scripts.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
