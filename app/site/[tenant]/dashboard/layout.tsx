import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings } from "@/lib/content";
import { getSessionUser } from "@/lib/auth";
import DashboardChrome from "@/components/dashboard/DashboardChrome";
import { getVerticalConfig } from "@/lib/verticals";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
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
  const user = await getSessionUser();

  const themeProps = {
    "data-vertical": tenant.vertical,
    "data-template": templateKeyFor(tenant),
  };

  // The login page renders bare, but still needs the tenant palette.
  if (!user) return <div {...themeProps} className="flex min-h-full flex-1 flex-col">{children}</div>;

  const settings = await getFirmSettings(tenant.id);
  const vertical = getVerticalConfig(tenant.vertical);

  return (
    <div {...themeProps} className="flex min-h-full flex-1 flex-col">
    <DashboardChrome
      firmName={settings?.firmName ?? tenant.displayName}
      basePath={basePath}
      siteHref={joinPath(basePath, "/")}
      navItems={vertical.dashboardNav}
      user={{ name: user.name, email: user.email, role: user.role }}
    >
      {children}
    </DashboardChrome>
    </div>
  );
}
