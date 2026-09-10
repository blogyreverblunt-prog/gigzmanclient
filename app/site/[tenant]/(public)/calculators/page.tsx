import { notFound } from "next/navigation";
import { ArrowRight, AlertTriangle } from "lucide-react";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import Card from "@/components/ui/Card";
import Badge, { statusTone } from "@/components/ui/Badge";
import CalculatorPicker from "@/components/site/CalculatorPicker";
import Illustration from "@/components/site/Illustration";
import PremiumV2CalculatorsIndexPage from "@/components/realestate/premium-v2/PremiumV2CalculatorsIndexPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getCalculators } from "@/lib/content";
import { CALCULATOR_STATUS_LABELS, formatDate } from "@/lib/format";
import { getVerticalConfig } from "@/lib/verticals";

const DESCRIPTIONS: Record<string, string> = {
  cafirm: "Indicative income tax, TDS and GST estimates. Results are not a substitute for professional advice.",
  realestate: "Indicative EMI, stamp duty and rental yield estimates. Results are not a substitute for professional advice.",
};

export async function generateMetadata(props: PageProps<"/site/[tenant]/calculators">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Calculators — ${settings?.firmName ?? ""}`,
    description: DESCRIPTIONS[tenant.vertical] ?? DESCRIPTIONS.cafirm,
  };
}

export default async function CalculatorsPage(props: PageProps<"/site/[tenant]/calculators">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2CalculatorsIndexPage tenant={tenant} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const vertical = getVerticalConfig(tenant.vertical);
  const calculators = (await getCalculators(tenant.id)).filter((c) => c.status !== "archived");

  const anyUnreviewed = calculators.some((c) => c.status === "ca_review_required");

  return (
    <>
      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <a href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </a>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Calculators</span>
        </nav>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <SectionHeader
            eyebrow="Tools"
            title="Indicative calculations with visible assumptions."
            description={
              vertical.id === "realestate"
                ? "Use these to form a budget before a site visit. Results do not replace professional advice and no calculator here recommends a course of action."
                : "Use these to form an estimate before a discussion. Results do not replace professional advice and no calculator here recommends a course of action."
            }
          />
          </div>
          <Illustration
            name="calculator-rupee"
            sizes="(max-width: 1024px) 55vw, 300px"
            className="mx-auto hidden h-auto w-full max-w-[280px] lg:block"
          />
        </div>

        {anyUnreviewed ? (
          <div className="mt-7 flex items-start gap-3 rounded-[10px] bg-accent-soft px-4 py-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Some calculators are awaiting professional verification of the rates in force for this
              period. Treat those results as provisional.
            </p>
          </div>
        ) : null}
      </Section>

      <Section tone="page" size="md">
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

        <h2 className="display-md mt-14">All calculators</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {calculators.map((calc) => (
            <Card key={calc.id} href={p(`/calculators/${calc.key}`)}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-semibold leading-snug text-ink">{calc.title}</p>
              </div>

              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
                {calc.description}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(calc.status)}>
                  {CALCULATOR_STATUS_LABELS[calc.status] ?? calc.status}
                </Badge>
                <span className="text-[11px] text-ink-subtle">v{calc.version}</span>
              </div>

              <p className="mt-3 text-[12px] text-ink-subtle">{calc.taxYear}</p>
              {calc.lastReviewedAt ? (
                <p className="mt-0.5 text-[11px] text-ink-subtle">
                  Reviewed {formatDate(calc.lastReviewedAt)}
                </p>
              ) : null}

              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-navy">
                Open calculator
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Card>
          ))}
        </div>

        <p className="mt-10 rounded-[10px] bg-accent-soft p-5 text-[12px] leading-relaxed text-ink-muted">
          Values entered into these calculators are processed in your browser. They are not
          transmitted to the firm, are not stored, and are not included in any enquiry you submit
          afterwards.
        </p>
      </Section>
    </>
  );
}
