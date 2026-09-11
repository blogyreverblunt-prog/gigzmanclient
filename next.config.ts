import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The homepage share card reads its background off disk at generation time.
  // Files under public/ are served statically but are not traced into a
  // function's bundle, so it has to be named explicitly or the card renders
  // without its photograph.
  outputFileTracingIncludes: {
    // Both files this route reads off disk. `readPublicFile` takes a runtime
    // path, so the tracer cannot see either one — and the excludes below now
    // strip public/ from every trace, so they have to be named here.
    "/site/[tenant]/(public)/opengraph-image": [
      "./public/brand/og-hero.jpg",
      "./public/verticals/*/templates/*/brand/**",
    ],
  },

  /**
   * Keep public/ out of every function bundle.
   *
   * opengraph-image.tsx calls `readFile(path.join(process.cwd(), "public", clean))`
   * with `clean` computed at runtime. Next’s tracer cannot resolve that, so it
   * conservatively traced the whole of public/ — 280MB — and because the route
   * sits in the (public) group, that trace landed on every route beneath the
   * layout. Measured: 51 of 61 routes traced 287MB each, of which 280MB was
   * images the CDN already serves.
   *
   * The cost was not size but function count. Vercel bundles Next routes into
   * as few Lambdas as it can, splitting only when a bundle exceeds its limit —
   * at 287MB apiece nothing could share, so every route became its own
   * function: 56 against the 12 a Hobby deployment allows, failing at
   * patchBuild with exceeded_serverless_functions_per_deployment.
   *
   * Static assets are served from the CDN and are never read from inside a
   * function, with the single exception re-included above.
   */
  outputFileTracingExcludes: {
    // Excludes beat includes: a blanket "./public/**" here also stripped the
    // files named in outputFileTracingIncludes above, and the share card lost
    // its background and every tenant logo. So exclude the heavy trees by name
    // and leave brand/ traced — it is 4.8MB against the 280MB below.
    //
    // If function count ever creeps back up, check this list first: a new
    // asset directory under public/ will not be excluded automatically.
    "**": [
      "./public/verticals/*/clients/**",
      "./public/verticals/*/templates/*/images/**",
      "./public/verticals/*/templates/*/maps/**",
      "./public/verticals/*/templates/*/farmhouses/**",
      "./public/verticals/*/templates/*/people/**",
      "./public/verticals/*/templates/*/backgrounds/**",
      "./public/verticals/*/templates/*/property-management/**",
      "./public/verticals/*/templates/*/property-management-page/**",
      "./public/3d/**",
      "./public/uploads/**",
    ],
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

    /**
     * Uploaded logos and property photos are the only remote images this app
     * renders. With BLOB_READ_WRITE_TOKEN set, `putObject` in lib/storage.ts
     * returns an absolute Vercel Blob URL, and that value goes straight into
     * next/image (PropertyCardV2, the dashboard managers). An undeclared
     * hostname is not a silent fallback like `qualities` above — next/image
     * throws, so the first production upload would break the very page it was
     * uploaded for.
     *
     * The wildcard is load-bearing: uploads PUT to blob.vercel-storage.com but
     * are served from a per-store subdomain that is not known until the store
     * exists. Rejected: pinning one literal host, which would mean editing
     * config again for every new Blob store.
     *
     * Development is unaffected — the local backend returns a relative
     * /uploads/ path, which next/image treats as same-origin.
     */
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],

    // Only ever true for static, locally-bundled SVGs we sourced ourselves
    // (developer partner logos) — never for user-supplied or remote SVGs.
    // Next's own recommended-safe combination: sandboxed + no inline scripts.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
