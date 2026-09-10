import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { officeLocations } from "@/lib/db/schema";
import { getBasePath, joinPath } from "@/lib/tenant";
import { getSessionUser } from "@/lib/auth";
import OfficesManager from "@/components/dashboard/OfficesManager";

/**
 * Additional office locations. The single address in Settings remains the
 * firm's canonical NAP — the one the footer, contact page and structured data
 * use — and these are the extra branches.
 */
export default async function DashboardOfficesPage() {
  const basePath = await getBasePath();
  const user = await getSessionUser();
  if (!user) redirect(joinPath(basePath, "/dashboard/login"));
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="display-md">Offices</h1>
        <p className="mt-4 rounded-[10px] border border-line bg-surface p-6 text-[14px] text-ink-muted">
          Office locations are managed by an administrator.
        </p>
      </div>
    );
  }

  const offices = await db
    .select()
    .from(officeLocations)
    .where(eq(officeLocations.clientId, user.clientId))
    .orderBy(asc(officeLocations.sortOrder));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="display-md">Offices</h1>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
        Extra locations beyond the main address in Settings. Only add rows here if the firm has more
        than one office.
      </p>

      <div className="mt-6">
        <OfficesManager offices={offices} />
      </div>
    </div>
  );
}
