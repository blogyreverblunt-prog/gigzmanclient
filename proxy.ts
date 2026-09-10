import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isVerticalId } from "./lib/verticals";
import { isTemplateUrlSlug } from "./lib/templates";
import { tenantSlugForHost } from "./lib/domains";

/**
 * Tenant resolution for a deployment that serves many client sites.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; the `middleware` export and the
 * edge runtime are deprecated here, so this runs on Node.
 *
 * path mode, most verticals — /{vertical}/{slug}/services       -> /services
 * path mode, realestate      — /{vertical}/{template}/{slug}/x  -> /x
 * host mode                  — clientdomain.com/services        -> /services
 *
 * Realestate carries an extra `{template}` segment (e.g. `temp-luxury-showcase`)
 * identifying which of the several real-estate landing-page templates a tenant
 * uses, since that vertical hosts more than one design direction — every other
 * vertical still has exactly one template, so it stays two-segment.
 *
 * Either way the internal route tree stays clean and the tenant travels as a
 * request header that Server Components read through `headers()`.
 *
 * This only checks that the vertical/template segments are *known* — it has no
 * database access. Whether they're correct *for that client* is asserted in
 * `lib/tenant.ts`, which already queries `clients` by slug and can compare
 * against the stored `vertical` (and, for realestate, its assigned template)
 * in the same round trip.
 */

const TENANT_MODE = process.env.TENANT_MODE === "host" ? "host" : "path";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$/;



export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (TENANT_MODE === "host") {
    const host = (request.headers.get("host") ?? "").split(":")[0];
    const headers = new Headers(request.headers);
    headers.set("x-tenant-host", host);
    headers.set("x-tenant-base", "");

    // Static assets and the internal prefix pass straight through.
    if (/\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith("/site/")) {
      return NextResponse.next({ request: { headers } });
    }

    // The rewrite is required, not optional. Every page now lives under
    // `app/site/[tenant]/`, so passing the request through unchanged — as this
    // branch did before the routes moved — 404s every path on the client's own
    // domain.
    const slug = tenantSlugForHost(host);
    if (!slug) return NextResponse.next({ request: { headers } });

    headers.set("x-tenant", slug);
    const url = request.nextUrl.clone();
    url.pathname = `/site/${slug}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  const segments = pathname.split("/").filter(Boolean);
  const [vertical, slug, ...rest] = segments;

  // The bare root is the single gated dashboard (app/page.tsx) — team-only, and
  // since CD-03a it lists every client rather than requiring a slug typed in by
  // hand. Reached only through `requirePlatformAdmin`.
  if (segments.length === 0) return NextResponse.next();

  // Files served from public/ live at the root and carry an extension. Without
  // this they would be treated as an unknown tenant and redirected away.
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();

  // The internal prefix is only ever reached through a rewrite below; a direct
  // request for it would render a tenant page with no tenant resolved.
  if (vertical === "site") return NextResponse.redirect(new URL("/", request.url));

  // The platform sign-in screen (app/login/**) — not a tenant path, "login"
  // is not a registered vertical id, so it needs this same early exemption.
  // There is no longer a separate /admin section: "/" itself is the single
  // gated dashboard, so an unrecognised /admin now falls through to the
  // generic "unknown vertical" redirect below, landing on "/" like any
  // other unrecognised path.
  if (vertical === "login") return NextResponse.next();

  // The platform dashboard's client screens (app/clients/**) — team-only, same
  // gate as `/`. Exempted here for the same reason as `login` above: "clients"
  // is not a registered vertical id, so without this the generic unknown-vertical
  // redirect below would bounce every one of these URLs to `/` with nothing
  // saying why. No conflict with a tenant URL: segment 0 is always the vertical,
  // never a client slug. Path mode only — in host mode every path belongs to the
  // one client that domain serves, and there is no platform dashboard there.
  if (vertical === "clients") return NextResponse.next();

  if (!vertical || !isVerticalId(vertical)) {
    // An unknown vertical segment would otherwise render a tenant page with
    // no tenant resolved.
    return NextResponse.redirect(new URL("/", request.url));
  }

  // A bare `/{vertical}` (no slug, e.g. `/realestate`) has no page — this
  // deployment no longer publishes a per-industry browsing surface, so it
  // falls through to Next's own 404 rather than rendering anything.
  if (!slug) return NextResponse.next();

  if (vertical === "realestate") {
    const templateUrlSlug = slug;
    const clientSlug = segments[2];

    if (!isTemplateUrlSlug(templateUrlSlug) || !clientSlug || !SLUG_PATTERN.test(clientSlug)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const tenantRest = segments.slice(3);
    const headers = new Headers(request.headers);
    headers.set("x-tenant", clientSlug);
    headers.set("x-tenant-vertical", vertical);
    headers.set("x-tenant-template-slug", templateUrlSlug);
    headers.set("x-tenant-base", `/${vertical}/${templateUrlSlug}/${clientSlug}`);

    const url = request.nextUrl.clone();
    // The tenant slug is part of the rewritten path, not just a header, so
    // pages can read it from `params` and stay statically renderable.
    url.pathname = `/site/${clientSlug}${tenantRest.length > 0 ? `/${tenantRest.join("/")}` : ""}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const headers = new Headers(request.headers);
  headers.set("x-tenant", slug);
  headers.set("x-tenant-vertical", vertical);
  headers.set("x-tenant-base", `/${vertical}/${slug}`);

  // Tenant pages live under an internal /site prefix so that `/` stays free for
  // the index of sites hosted on this deployment.
  const url = request.nextUrl.clone();
  url.pathname = `/site/${slug}${rest.length > 0 ? `/${rest.join("/")}` : ""}`;

  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Anything with a file extension is a static asset and is skipped outright.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.).*)"],
};
