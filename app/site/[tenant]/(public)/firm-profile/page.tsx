import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Illustration from "@/components/site/Illustration";
import PremiumV2AboutPage from "@/components/realestate/premium-v2/PremiumV2AboutPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getTeam, getServices } from "@/lib/content";
import { SERVICE_CATEGORY_LABELS, formatDate } from "@/lib/format";

export async function generateMetadata(props: PageProps<"/site/[tenant]/firm-profile">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Firm Profile — ${settings?.firmName ?? ""}`,
    description: settings?.overview?.slice(0, 160),
  };
}

const ENGAGEMENT_APPROACH = [
  {
    title: "Understand the requirement",
    detail: "Review the circumstances and confirm what is actually required.",
  },
  {
    title: "Define the engagement",
    detail: "Agree scope, responsibilities and timelines in writing before work begins.",
  },
  {
    title: "Execute and communicate",
    detail: "Carry out the work and report progress, including anything that changes the position.",
  },
];

export default async function FirmProfilePage(props: PageProps<"/site/[tenant]/firm-profile">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2AboutPage tenant={tenant} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, team, services] = await Promise.all([
    getFirmSettings(tenant.id),
    getTeam(tenant.id),
    getServices(tenant.id),
  ]);
  if (!settings) notFound();

  const categories = [...new Set(services.map((s) => s.category))];
  const showTeam = settings.teamEnabled && team.length > 0;

  return (
    <>
      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <a href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </a>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Firm Profile</span>
        </nav>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <SectionHeader
            eyebrow="About the firm"
            title="Professional identity built on clarity and responsibility."
            description={settings.overview ?? undefined}
          />
          </div>
          <Illustration
            name="podium"
            sizes="(max-width: 1024px) 55vw, 300px"
            className="mx-auto hidden h-auto w-full max-w-[280px] lg:block"
          />
        </div>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_340px] lg:gap-14">
          <div className="space-y-10">
            <div>
              <h2 className="display-md">Understand the requirement before proceeding</h2>
              <div className="mt-5 space-y-3">
                {ENGAGEMENT_APPROACH.map((item, i) => (
                  <div key={item.title} className="flex gap-4 rounded-[10px] border border-line p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="display-md">Areas supported by the firm</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {categories.map((category) => {
                  const items = services.filter((s) => s.category === category);
                  return (
                    <Card key={category}>
                      <p className="text-[14px] font-semibold text-ink">
                        {SERVICE_CATEGORY_LABELS[category] ?? category}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {items.slice(0, 5).map((item) => (
                          <li
                            key={item.id}
                            className="flex gap-2 text-[13px] leading-relaxed text-ink-muted"
                          >
                            <Check
                              className="mt-1 h-3 w-3 shrink-0 text-accent"
                              aria-hidden="true"
                            />
                            {item.title}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            </div>

            {showTeam ? (
              <div>
                <h2 className="display-md">Professionals</h2>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {team.map((member) => (
                    <Card key={member.id}>
                      <div className="flex items-start gap-3.5">
                        {/* Photo placeholder — replaced with a passport photograph at delivery. */}
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-semibold text-white">
                          {member.name
                            .replace(/^CA\s+/i, "")
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase())
                            .join("")}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-ink">{member.name}</p>
                          {member.designation ? (
                            <p className="mt-0.5 text-[12px] text-ink-subtle">
                              {member.designation}
                            </p>
                          ) : null}
                          {member.qualifications ? (
                            <p className="mt-1.5 text-[12px] text-ink-muted">
                              {member.qualifications}
                              {member.membershipNumber
                                ? ` · Membership No. ${member.membershipNumber}`
                                : ""}
                            </p>
                          ) : null}
                          {member.bio ? (
                            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                              {member.bio}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <p className="text-[14px] font-semibold text-ink">Firm details</p>
              <dl className="mt-4 space-y-3.5">
                <Detail label="Firm name" value={settings.firmName} />
                <Detail label="Nature of practice" value={settings.businessCategory} />
                <Detail label="Year of establishment" value={settings.establishedYear} />
                <Detail label="Firm registration number" value={settings.firmRegistrationNumber} />
                <Detail
                  label="Office"
                  value={[settings.locality, settings.region].filter(Boolean).join(", ")}
                />
              </dl>
              <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-subtle">
                Details are published for identification. Last updated{" "}
                {formatDate(settings.updatedAt)}.
              </p>
            </Card>

            <Card tone="navy">
              <p className="text-[14px] font-semibold">Discuss a requirement</p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                Engagements are accepted after reviewing the requirement.
              </p>
              <Button href={p("/contact")} variant="onNavy" size="sm" className="mt-4 w-full">
                Submit Requirement
              </Button>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-ink">{value || "—"}</dd>
    </div>
  );
}
