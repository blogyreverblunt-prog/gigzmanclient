import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import EmiCalculatorHeroV2 from "./home-loan/EmiCalculatorHeroV2";
import RelatedCardsV2 from "./RelatedCardsV2";
import { GpContainer, GpSection } from "./gp-primitives";
import { TOOL_ICONS } from "./toolIcons";
import { basePathFor, joinPath, type Tenant } from "@/lib/tenant";
import { getCalculator } from "@/lib/content";
import { toolHrefsFor } from "@/lib/premium-v2/tools";

/**
 * `/calculators/emi` for this template.
 *
 * The financing hub at `/home-loan` carries the same calculator, but only
 * tenants with a lender relationship publish that page — this is the plain
 * standalone version every tenant gets, in the current calculator design
 * rather than the retired panel UI.
 */
export default async function PremiumV2EmiCalculatorPage({ tenant }: { tenant: Tenant }) {
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const calculator = await getCalculator(tenant.id, "emi");
  if (!calculator || calculator.status === "archived") notFound();

  const needsReview = calculator.status !== "active" || !calculator.reviewerName;
  const others = toolHrefsFor(tenant, basePath).filter((tool) => tool.key !== "emi");

  return (
    <>
      <EmiCalculatorHeroV2
        heading="Home Loan EMI Calculator for Gurugram"
        subheading="Estimate the monthly instalment, the total interest and the full repayment cost before you shortlist a property."
        // A ₹1.5 Cr loan against a ₹2 Cr purchase — the mid-market Gurugram
        // case, so the first number on screen is a plausible one.
        initialPrice={20000000}
        initialDownPayment={5000000}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/calculators")} className="hover:text-[color:var(--gp-gold-300)]">
              Calculators
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Home Loan EMI</span>
          </nav>
        }
      />

      <GpSection tone="cream">
        <GpContainer>
          <div className="max-w-3xl">
            {needsReview ? (
              <div className="mb-8 flex items-start gap-3 rounded-[var(--gp-radius-md)] border border-[color:var(--gp-gold-600)]/25 bg-[color:var(--gp-gold-600)]/[0.08] px-4 py-3.5">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-gold-600)]"
                  aria-hidden="true"
                />
                <p className="text-[13px] leading-relaxed text-[color:var(--gp-body)]">
                  The rate presets here have not yet been confirmed against the offers in force.
                  Treat the result as provisional.
                </p>
              </div>
            ) : null}

            <h2 className="font-display text-[16px] text-[color:var(--gp-ink)]">
              Assumptions and limits
            </h2>
            {calculator.disclaimer ? (
              <p className="mt-3 text-[14px] leading-relaxed text-[color:var(--gp-body)]">
                {calculator.disclaimer}
              </p>
            ) : null}
            {calculator.sourceNote ? (
              <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--gp-muted)]">
                {calculator.sourceNote}
              </p>
            ) : null}
            <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--gp-muted)]">
              Values you enter stay in your browser. They are not sent to us, are not stored, and
              are not included in any enquiry you submit afterwards.{" "}
              <Link
                href={p("/legal/calculator-disclaimer")}
                className="underline underline-offset-2 hover:text-[color:var(--gp-gold-600)]"
              >
                Read the full disclaimer
              </Link>
            </p>
          </div>

          <RelatedCardsV2
            className="mt-14"
            title="Other tools"
            items={others.map((tool) => ({
              href: tool.href,
              title: tool.label,
              subtitle: tool.blurb,
              icon: TOOL_ICONS[tool.key],
            }))}
            columns={3}
          />
        </GpContainer>
      </GpSection>
    </>
  );
}
