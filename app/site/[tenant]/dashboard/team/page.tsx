import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { getBasePath, joinPath, getTenant } from "@/lib/tenant";
import { getSessionUser } from "@/lib/auth";
import { getVerticalConfig } from "@/lib/verticals";
import TeamManager from "@/components/dashboard/TeamManager";

/**
 * Team members were seeded from YAML only until CD-08 — the rows existed from
 * the first schema, but a firm that hired someone had to ask a developer.
 *
 * Available to both verticals: a CA practice and an estate agency both have
 * people, and both templates render them.
 */
export default async function DashboardTeamPage() {
  const basePath = await getBasePath();
  const user = await getSessionUser();
  if (!user) redirect(joinPath(basePath, "/dashboard/login"));
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="display-md">Team</h1>
        <p className="mt-4 rounded-[10px] border border-line bg-surface p-6 text-[14px] text-ink-muted">
          Team members are managed by an administrator.
        </p>
      </div>
    );
  }

  const tenant = await getTenant();
  const vertical = getVerticalConfig(tenant?.vertical);

  const members = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.clientId, user.clientId))
    .orderBy(asc(teamMembers.sortOrder));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="display-md">Team</h1>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
        People shown on the website. Qualifications and membership numbers are regulated claims —
        leave them blank rather than guessing. The section is hidden entirely while the Team switch
        in Settings is off.
      </p>

      <div className="mt-6">
        <TeamManager
          members={members}
          // The label differs per industry: an ICAI membership number for a
          // practice, a RERA registration for an agency.
          membershipLabel={vertical.footer.registrationLabel}
        />
      </div>
    </div>
  );
}
