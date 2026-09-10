import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Phone,
  Users,
  Clock,
  ShieldCheck,
  UserCheck,
  LineChart,
  PiggyBank,
  CalendarCheck,
  Lightbulb,
  BookOpenCheck,
  FileSpreadsheet,
  Receipt,
  ClipboardCheck,
  Wallet,
  Building2,
  type LucideIcon,
} from "lucide-react";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import HeroVisual from "@/components/site/HeroVisual";
import ComplianceTimeline from "@/components/site/ComplianceTimeline";
import IndustriesGrid from "@/components/site/IndustriesGrid";
import CalculatorPicker from "@/components/site/CalculatorPicker";
import ServiceIcon from "@/components/site/ServiceIcon";
import Illustration, { type IllustrationName } from "@/components/site/Illustration";
import Testimonials from "@/components/site/Testimonials";
import RealEstateTemplateHome from "@/components/realestate/templates";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import {
  getFirmSettings,
  getServices,
  getUpcomingCompliance,
  getPublishedUpdates,
  getCalculators,
  getLocalities,
} from "@/lib/content";
import { SERVICE_CATEGORY_LABELS, formatDate } from "@/lib/format";
import { resolveHomeMeta } from "@/lib/seo/generated";

export async function generateMetadata(props: PageProps<"/site/[tenant]">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  if (!settings) return {};

  // `seoTitle` / `seoDescription` are OVERRIDES since CD-06: null means
  // "generate one", and the generated pair tracks the business name,
  // category and locality the operator maintains anyway. Nothing writes the
  // generated text back into the columns — that would freeze it.
  const [localities, services] = await Promise.all([
    getLocalities(tenant.id),
    getServices(tenant.id),
  ]);
  const { title, description } = resolveHomeMeta(settings, tenant.vertical, {
    localities: localities.map((l) => l.name),
    serviceTitles: services.map((s) => s.title),
  });
  return { title, description };
}

const VALUE_PROPS = [
  {
    icon: LineChart,
    title: "Considered Planning",
    detail: "Positions reviewed against your circumstances before anything is filed.",
  },
  {
    icon: PiggyBank,
    title: "Lawful Optimisation",
    detail: "Reliefs and deductions applied only where they genuinely apply.",
  },
  {
    icon: CalendarCheck,
    title: "Compliance Made Easy",
    detail: "Statutory dates tracked so filings are prepared ahead of the deadline.",
  },
  {
    icon: Lightbulb,
    title: "Actionable Reporting",
    detail: "Clear reporting you can act on, without accounting jargon.",
  },
];

/** Artwork per update category, so article cards stay visually distinct. */
const UPDATE_ART: Record<string, IllustrationName> = {
  "Income Tax": "calculator-rupee",
  GST: "percent-tray",
  TDS: "documents-shield",
  MCA: "checklist-search",
  Audit: "checklist-search",
  "Business Compliance": "documents-shield",
  "Due Dates": "calendar-clock",
};

const SERVICE_ICONS: Record<string, LucideIcon> = {
  taxation: Receipt,
  gst: FileSpreadsheet,
  audit_assurance: ClipboardCheck,
  business_corporate: Building2,
};

/**
 * Credential figures shown in the hero.
 *
 * Placeholder values — these are factual claims about the practice and must be
 * confirmed with the firm before delivery, or the strip removed.
 */
const CREDENTIALS = [
  { icon: Users, value: "500+", label: "Clients Served" },
  { icon: Clock, value: "25+", label: "Years of Experience" },
  { icon: ShieldCheck, value: "99%", label: "Client Retention" },
  { icon: UserCheck, value: "50+", label: "Engagements Yearly" },
];

const TESTIMONIALS = [
  {
    quote:
      "The firm reviewed our position before suggesting anything, and explained what was and was not available to us. Filings have been on time since.",
    name: "Rohit Sharma",
    role: "Director, Manufacturing",
  },
  {
    quote:
      "Responsive and precise. Questions on GST treatment are answered with the reasoning, not just an instruction.",
    name: "Anjali Mehta",
    role: "Founder, Design Studio",
  },
  {
    quote:
      "The reporting we receive each quarter is clear enough to act on without an accounting background.",
    name: "Vikram Pillai",
    role: "Proprietor, Exports",
  },
];

export default async function HomePage(props: PageProps<"/site/[tenant]">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  // The real-estate home page has an entirely different structure (hero
  // photography, property/locality grids, no compliance timeline) — it is a
  // separate component rather than a further branch of this one, so the CA
  // path below stays exactly as it was before the vertical split.
  if (tenant.vertical === "realestate") {
    return <RealEstateTemplateHome tenant={tenant} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, services, compliance, updates, calculators] = await Promise.all([
    getFirmSettings(tenant.id),
    getServices(tenant.id),
    getUpcomingCompliance(tenant.id),
    getPublishedUpdates(tenant.id),
    getCalculators(tenant.id),
  ]);

  if (!settings) notFound();

  const categories = [...new Set(services.map((s) => s.category))];
  const nextDeadline = compliance[0];

  // Six representative services, matching the reference layout.
  const featured = categories
    .flatMap((category) => services.filter((s) => s.category === category).slice(0, 2))
    .slice(0, 6);

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="bg-tint">
        <div className="mx-auto w-full max-w-7xl px-5 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            <div>
              <h1 className="display-xl">
                Your Growth.
                <br />
                Our <span className="display-accent">Compliance.</span>
              </h1>
              <p className="prose-body mt-5 max-w-lg text-[15px] sm:text-base">
                {settings.overview}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button href={p("/services")} size="lg">
                  Explore Services
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button href={p("/contact")} variant="secondary" size="lg">
                  Talk to a CA
                </Button>
              </div>
            </div>

            <HeroVisual
              nextDeadline={
                nextDeadline
                  ? {
                      title: nextDeadline.title,
                      date: formatDate(nextDeadline.extendedDueDate ?? nextDeadline.dueDate),
                    }
                  : null
              }
            />
          </div>

          <ul className="mt-12 grid grid-cols-2 gap-6 border-t border-line-strong py-7 sm:grid-cols-4 sm:gap-4">
            {CREDENTIALS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label} className="flex items-center gap-3">
                  <Icon className="h-[18px] w-[18px] shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-display text-[17px] font-medium leading-none text-navy">
                      {item.value}
                    </p>
                    <p className="mt-1 text-[11px] leading-tight text-ink-muted">{item.label}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── How we add value ───────────────────────────────────────────── */}
      <Section tone="page" size="md" wide>
        <h2 className="display-lg title-rule text-center">How We Add Value</h2>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_PROPS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-tint">
                  <Icon className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Services ───────────────────────────────────────────────────── */}
      <Section tone="page" size="sm" wide>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display-lg">Our Services</h2>
            <p className="mt-2 text-[14px] text-ink-muted">
              Engagements accepted after reviewing the requirement.
            </p>
          </div>
          <Link
            href={p("/services")}
            className="inline-flex min-h-[38px] items-center gap-1.5 py-1 text-[13px] font-medium text-navy hover:text-accent"
          >
            View All Services
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {featured.map((service) => {
            return (
              <Card
                key={service.id}
                href={p(`/services/${service.slug}`)}
                interactive
                className="flex flex-col"
              >
                <ServiceIcon
                  slug={service.slug}
                  category={service.category}
                  className="h-5 w-5"
                />
                <p className="mt-4 text-[14px] font-semibold leading-snug text-ink">
                  {service.title}
                </p>
                <p className="mt-2 flex-1 text-[12px] leading-relaxed text-ink-muted">
                  {service.summary}
                </p>
                <ArrowRight className="mt-4 h-4 w-4 text-accent" aria-hidden="true" />
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ── Compliance timeline ────────────────────────────────────────── */}
      {compliance.length > 0 ? (
        <Section tone="page" size="sm" wide>
          <ComplianceTimeline
            events={compliance.map((e) => ({
              id: e.id,
              title: e.title,
              dueDate: e.dueDate,
              extendedDueDate: e.extendedDueDate,
            }))}
            calendarHref={p("/compliance-calendar")}
          />
        </Section>
      ) : null}

      {/* ── Calculators ────────────────────────────────────────────────── */}
      {calculators.length > 0 ? (
        <Section tone="tint" size="md" wide>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="display-lg">Estimate Before You Discuss</h2>
              <p className="mt-2 text-[14px] text-ink-muted">
                Pick a calculator, enter the key figures, and open the full working.
              </p>
            </div>
            <Link
              href={p("/calculators")}
              className="inline-flex min-h-[38px] items-center gap-1.5 py-1 text-[13px] font-medium text-navy hover:text-accent"
            >
              All Calculators
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-7">
            <CalculatorPicker
              calculators={calculators.map((c) => ({
                key: c.key,
                title: c.title,
                description: c.description,
                taxYear: c.taxYear,
                version: c.version,
                status: c.status,
              }))}
              calculatorsHref={p("/calculators")}
            />
          </div>
        </Section>
      ) : null}

      {/* ── Industries ─────────────────────────────────────────────────── */}
      <Section tone="page" size="sm" wide>
        <div>
          <h2 className="display-lg">Industries We Serve</h2>
          <p className="mt-2 text-[14px] text-ink-muted">
            Experience across a range of sectors and entity types.
          </p>
        </div>
        <div className="mt-8">
          <IndustriesGrid />
        </div>
      </Section>

      {/* ── Testimonials (ICAI-gated) ──────────────────────────────────── */}
      {settings.reviewsEnabled ? (
        <Section tone="page" size="sm" wide>
          <div>
            <h2 className="display-lg">What Our Clients Say</h2>
            <p className="mt-2 text-[14px] text-ink-muted">Experiences shared by clients.</p>
          </div>
          <div className="mt-7">
            <Testimonials testimonials={TESTIMONIALS} />
          </div>
        </Section>
      ) : null}

      {/* ── Insights ───────────────────────────────────────────────────── */}
      {updates.length > 0 ? (
        <Section tone="page" size="sm" wide>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="display-lg">Insights &amp; Resources</h2>
              <p className="mt-2 text-[14px] text-ink-muted">
                Notes on tax and compliance developments.
              </p>
            </div>
            <Link
              href={p("/updates")}
              className="inline-flex min-h-[38px] items-center gap-1.5 py-1 text-[13px] font-medium text-navy hover:text-accent"
            >
              View All Articles
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-3">
            {updates.slice(0, 3).map((update) => (
              <Card
                key={update.id}
                href={p(`/updates/${update.slug}`)}
                interactive
                padded={false}
                className="overflow-hidden"
              >
                <div className="relative flex h-[150px] items-center justify-center overflow-hidden bg-tint-deep">
                  <Badge tone="accent" className="absolute left-4 top-4 z-10">
                    {update.category}
                  </Badge>
                  <Illustration
                    name={UPDATE_ART[update.category] ?? "growth-blue"}
                    sizes="(max-width: 768px) 60vw, 260px"
                    className="h-[124px] w-auto"
                  />
                </div>
                <div className="p-5">
                  <p className="display-sm leading-snug">{update.title}</p>
                  <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
                    {update.excerpt}
                  </p>
                  <p className="mt-4 text-[11px] text-ink-subtle">
                    {formatDate(update.publishedAt)}
                    {update.applicableYear ? ` · ${update.applicableYear}` : ""}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <Section tone="page" size="md" wide>
        <div className="overflow-hidden rounded-[16px] bg-tint-deep px-6 py-11 sm:px-10 sm:py-14">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2 className="display-lg">
                Let&rsquo;s build your
                <br className="hidden sm:block" /> financial future{" "}
                <span className="display-accent">together.</span>
              </h2>
              <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-ink-muted">
                Share the requirement and the relevant circumstances. It is reviewed before any
                engagement is accepted.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Button href={p("/contact")} variant="accent" size="lg">
                  Book a Consultation
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                {settings.phone ? (
                  <span className="flex items-center gap-2 text-[14px] text-ink-muted">
                    or
                    <a
                      href={`tel:${settings.phone.replace(/\s/g, "")}`}
                      className="inline-flex min-h-[38px] items-center gap-1.5 py-1 font-medium text-navy hover:text-accent"
                    >
                      <Phone className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                      {settings.phone}
                    </a>
                  </span>
                ) : null}
              </div>
            </div>

            <Illustration
              name="growth-orange"
              sizes="(max-width: 1024px) 60vw, 380px"
              className="mx-auto hidden h-auto w-full max-w-[380px] lg:block"
            />
          </div>
        </div>
      </Section>
    </>
  );
}
