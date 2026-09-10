import { notFound } from "next/navigation";
import Link from "next/link";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import Button from "@/components/ui/Button";
import FaqAccordion from "@/components/site/FaqAccordion";
import Illustration from "@/components/site/Illustration";
import PremiumV2FaqPage from "@/components/realestate/premium-v2/PremiumV2FaqPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings } from "@/lib/content";
import { buildFaqJsonLd, buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";

export async function generateMetadata(props: PageProps<"/site/[tenant]/faq">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Frequently Asked Questions — ${settings?.firmName ?? ""}`,
    description:
      "Common questions about engaging a chartered accountant, the engagement process, and how requirements are reviewed.",
  };
}

/**
 * Deliberately excludes any question about fees. ICAI guidelines prohibit a
 * practice publishing professional fees or offers of free service.
 */
const FAQ_GROUPS = [
  {
    heading: "Working with the firm",
    faqs: [
      {
        question: "What is the difference between a chartered accountant and a tax consultant?",
        answer:
          "A chartered accountant is a member of the Institute of Chartered Accountants of India, holds a certificate of practice, and is the only professional permitted to carry out certain attest functions such as statutory audit and tax audit. A tax consultant may assist with preparation and filing but cannot perform work reserved for a chartered accountant.",
      },
      {
        question: "How does an engagement begin?",
        answer:
          "The requirement is reviewed first. If the firm can support it, scope, responsibilities and timelines are agreed in writing before work begins. Submitting an enquiry through this website does not by itself create a professional relationship.",
      },
      {
        question: "What information is needed at the first discussion?",
        answer:
          "A general description of the requirement and the relevant circumstances is enough to begin — for example the taxpayer or entity category, the period involved, and what has already been filed. A specific checklist is shared after the requirement has been reviewed.",
      },
      {
        question: "Can an existing set of books or filings be taken over partway through a year?",
        answer:
          "Generally yes, subject to a review of the existing records and agreement on the opening position. Any pending or delayed compliance identified during that review is reported before the engagement is accepted.",
      },
    ],
  },
  {
    heading: "Filing and compliance",
    faqs: [
      {
        question: "Which income tax return form applies to me?",
        answer:
          "The form depends on the sources of income, residential status and taxpayer category. It is determined after reviewing your details rather than assumed in advance.",
      },
      {
        question: "Is registration under GST required for my business?",
        answer:
          "Registration is generally required once turnover crosses the applicable threshold, and in certain cases irrespective of turnover — for example where inter-state taxable supplies are made. Applicability is assessed on the facts.",
      },
      {
        question: "Do audit provisions apply to my business?",
        answer:
          "Audit applicability is assessed against the turnover or gross receipts thresholds and the conditions prescribed for the relevant previous year, including the provisions under which income is offered to tax.",
      },
      {
        question: "What should be done on receiving a notice?",
        answer:
          "The notice should be reviewed promptly to identify the provision under which it has been issued and the period available to respond. Response periods are usually short and are stated in the notice itself.",
      },
    ],
  },
  {
    heading: "This website",
    faqs: [
      {
        question: "Are the calculators on this website reliable?",
        answer:
          "They produce indicative estimates using a stated rate set, and each displays its version, applicable period and review status. Where rates are shown as awaiting professional verification, the result should be treated as provisional. No calculator here recommends a course of action or identifies a preferred tax regime.",
      },
      {
        question: "What happens to information entered into a calculator?",
        answer:
          "Values entered are processed in your browser. They are not transmitted to the firm, are not stored, and are not included in any enquiry submitted afterwards.",
      },
      {
        question: "What information should not be sent through the enquiry form?",
        answer:
          "Do not send PAN, Aadhaar, passwords, one-time passwords, bank details or financial documents through this website. Only the details needed to understand and respond to your enquiry are collected.",
      },
      {
        question: "Are the compliance dates published here guaranteed to be current?",
        answer:
          "Dates are published for general reference and each entry shows when it was last verified. Due dates may be extended or altered by the relevant authority after publication, so confirm the position before filing.",
      },
    ],
  },
];

export default async function FaqPage(props: PageProps<"/site/[tenant]/faq">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2FaqPage tenant={tenant} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const allFaqs = FAQ_GROUPS.flatMap((g) => g.faqs);

  return (
    <>
      <script {...jsonLdProps(buildFaqJsonLd(allFaqs))} />
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "FAQs", url: p("/faq") },
          ]),
        )}
      />

      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <Link href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">FAQs</span>
        </nav>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <SectionHeader
            eyebrow="Common questions"
            title="Questions asked before an engagement begins."
            description="General answers only. How a provision applies depends on the specific facts and the law in force."
          />
          </div>
          <Illustration
            name="checklist-search"
            sizes="(max-width: 1024px) 55vw, 300px"
            className="mx-auto hidden h-auto w-full max-w-[280px] lg:block"
          />
        </div>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px] lg:gap-14">
          <div className="space-y-10">
            {FAQ_GROUPS.map((group) => (
              <div key={group.heading}>
                <h2 className="display-md">{group.heading}</h2>
                <FaqAccordion faqs={group.faqs} className="mt-4" />
              </div>
            ))}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[10px] bg-navy p-5 text-white">
              <p className="text-[14px] font-semibold">Question not answered here?</p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                Share the requirement and the relevant circumstances, and the firm will respond.
              </p>
              <Button href={p("/contact")} variant="onNavy" size="sm" className="mt-4 w-full">
                Submit Requirement
              </Button>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
