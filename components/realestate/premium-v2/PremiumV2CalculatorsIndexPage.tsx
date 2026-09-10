import Link from "next/link";
import { GpContainer, GpEyebrow } from "./gp-primitives";
import RelatedCardsV2 from "./RelatedCardsV2";
import { TOOL_ICONS } from "./toolIcons";
import { basePathFor, joinPath, type Tenant } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { toolHrefsFor } from "@/lib/premium-v2/tools";

/**
 * Lists the calculators this template actually publishes, from
 * lib/premium-v2/tools.ts — not the `calculators` table. That table still
 * holds the retired first-generation rows (stamp duty, and the panel-UI EMI
 * and rental-yield), which is what this page used to render, so it advertised
 * tools that no longer exist in that form.
 */
export default async function PremiumV2CalculatorsIndexPage({ tenant }: { tenant: Tenant }) {
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const settings = await getFirmSettings(tenant.id);
  if (!settings) return null;

  const tools = toolHrefsFor(tenant, basePath);

  return (
    <div className="gp-section bg-[color:var(--gp-cream-100)]">
      <GpContainer>
        <nav aria-label="Breadcrumb" className="mb-4 text-[12px] text-[color:var(--gp-muted)]">
          <Link href={p("/")} className="inline-block py-1 hover:text-[color:var(--gp-gold-600)]">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <span>Calculators</span>
        </nav>

        <GpEyebrow>Tools for Your Decision</GpEyebrow>
        <h1 className="gp-section-title font-display mt-3 max-w-2xl text-[color:var(--gp-ink)]">
          Indicative calculations with visible assumptions.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[color:var(--gp-body)]">
          Use these to form a budget before a site visit. Results do not replace professional
          advice, and no calculator here recommends a course of action.
        </p>

        <RelatedCardsV2
          className="mt-12"
          items={tools.map((tool) => ({
            href: tool.href,
            title: tool.label,
            subtitle: tool.blurb,
            icon: TOOL_ICONS[tool.key],
          }))}
        />

        <p className="mt-12 max-w-3xl rounded-[var(--gp-radius-md)] bg-[color:var(--gp-cream-200)] p-5 text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
          Values entered into these calculators are processed in your browser. They are not
          transmitted to us, are not stored, and are not included in any enquiry you submit
          afterwards.
        </p>
      </GpContainer>
    </div>
  );
}
