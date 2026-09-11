import { activeTenants } from "@/lib/static-params";

/**
 * An unrecognised tenant slug is a 404, not an on-demand render.
 *
 * This covers the whole subtree, so the pages with no dynamic segment of their
 * own — /faq, /contact, /careers — become static HTML rather than each keeping
 * a server function alive for tenant slugs that do not exist. `lib/tenant.ts`
 * already refused those at runtime; this refuses them at the routing layer.
 */
export const dynamicParams = false;

/**
 * Owns `generateStaticParams` for the `[tenant]` segment.
 *
 * This deliberately sits here rather than inside the `(public)` route group.
 * A route group is transparent in the URL, and Next did call the group
 * layout's generateStaticParams — but it then discarded the params returned
 * by *nested* dynamic segments below it, so the 500+ home-loan pages were
 * never prerendered. Declaring the tenant params on the real segment fixes
 * the chain.
 */
export async function generateStaticParams() {
  // Shares `activeTenants()` with every nested segment so a single-client
  // deployment (`TENANT_ONLY`) is narrowed here too. Enumerating all clients
  // here instead put other tenants' prerendered pages inside a deployment
  // built for one client — harmless to serve, but not theirs to ship. It also
  // falls back to an empty list when the database is unreachable at build
  // time, so a build never fails over this.
  const rows = await activeTenants();
  return rows.map((row) => ({ tenant: row.slug }));
}

export default function TenantSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
