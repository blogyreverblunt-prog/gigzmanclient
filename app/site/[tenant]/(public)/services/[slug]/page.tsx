import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, FileText } from "lucide-react";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import FaqAccordion from "@/components/site/FaqAccordion";
import ServiceIcon from "@/components/site/ServiceIcon";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getService, getServices } from "@/lib/content";
import { SERVICE_CATEGORY_LABELS, formatDate } from "@/lib/format";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";

/** Prerenders every service page for each tenant. */
export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const rows = await getServices(tenant.id);
    return rows.map((row) => ({ slug: row.slug }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/services/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, service] = await Promise.all([
    getFirmSettings(tenant.id),
    getService(tenant.id, slug),
  ]);
  if (!service) return {};
  return {
    title: `${service.title} — ${settings?.firmName ?? ""}`,
    description: service.summary ?? undefined,
  };
}

export default async function ServiceDetailPage(props: PageProps<"/site/[tenant]/services/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [service, allServices] = await Promise.all([
    getService(tenant.id, slug),
    getServices(tenant.id),
  ]);

  if (!service) notFound();

  const related = allServices
    .filter((s) => s.category === service.category && s.id !== service.id)
    .slice(0, 4);

  const faqs = service.faqs ?? [];
  const faqJsonLd = buildFaqJsonLd(faqs);

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Services", url: p("/services") },
            { name: service.title, url: p(`/services/${service.slug}`) },
          ]),
        )}
      />
      {faqJsonLd ? <script {...jsonLdProps(faqJsonLd)} /> : null}

      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <Link href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={p("/services")} className="inline-block py-1 hover:text-navy">
            Services
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{service.title}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <ServiceIcon
            slug={service.slug}
            category={service.category}
            boxed
            boxClassName="h-11 w-11 rounded-[10px] bg-surface border border-line"
            className="h-5 w-5"
          />
          <Badge tone="accent">{SERVICE_CATEGORY_LABELS[service.category] ?? service.category}</Badge>
          {service.isCaExclusive ? (
            <Badge tone="info">Rendered by a chartered accountant</Badge>
          ) : null}
        </div>

        <h1 className="display-xl mt-4 max-w-3xl">{service.title}</h1>
        {service.overview ? (
          <p className="prose-body mt-5 max-w-2xl text-[15px] sm:text-base">{service.overview}</p>
        ) : null}

        <div className="mt-8">
          <Button href={p(`/contact?service=${service.slug}`)}>
            Discuss This Requirement
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px] lg:gap-14">
          <div className="space-y-10">
            {service.whoNeedsThis && service.whoNeedsThis.length > 0 ? (
              <div>
                <h2 className="display-md">Who may need this service</h2>
                <ul className="mt-4 space-y-2.5">
                  {service.whoNeedsThis.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-muted">
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {service.scopeOfAssistance && service.scopeOfAssistance.length > 0 ? (
              <div>
                <h2 className="display-md">Scope of assistance</h2>
                <ul className="mt-4 space-y-2.5">
                  {service.scopeOfAssistance.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-muted">
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {service.engagementProcess && service.engagementProcess.length > 0 ? (
              <div>
                <h2 className="display-md">Engagement process</h2>
                <ol className="mt-4 space-y-3">
                  {service.engagementProcess.map((step, i) => (
                    <li key={step.step} className="flex gap-4 rounded-[10px] border border-line p-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[14px] font-semibold text-ink">{step.step}</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                          {step.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {service.timelines || service.considerations ? (
              <div className="rounded-[10px] bg-accent-soft p-5 sm:p-6">
                {service.timelines ? (
                  <>
                    <h3 className="text-[14px] font-semibold text-ink">Applicable timelines</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                      {service.timelines}
                    </p>
                  </>
                ) : null}
                {service.considerations ? (
                  <>
                    <h3 className="mt-5 text-[14px] font-semibold text-ink">
                      Important considerations
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                      {service.considerations}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {faqs.length > 0 ? (
              <div>
                <h2 className="display-md">Frequently asked questions</h2>
                <FaqAccordion faqs={faqs} className="mt-4" />
              </div>
            ) : null}

            <p className="border-t border-line pt-5 text-[12px] leading-relaxed text-ink-subtle">
              This page is general information and does not constitute professional advice.
              Applicability depends on the specific facts and the law in force.
              {service.lastReviewedAt
                ? ` Last reviewed ${formatDate(service.lastReviewedAt)}.`
                : ""}
            </p>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {service.documentsRequired && service.documentsRequired.length > 0 ? (
              <Card>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" aria-hidden="true" />
                  <p className="text-[14px] font-semibold text-ink">
                    Information generally reviewed
                  </p>
                </div>
                <ul className="mt-3.5 space-y-2">
                  {service.documentsRequired.map((doc) => (
                    <li key={doc} className="text-[13px] leading-relaxed text-ink-muted">
                      · {doc}
                    </li>
                  ))}
                </ul>
                <p className="mt-3.5 text-[11px] leading-relaxed text-ink-subtle">
                  A specific checklist is shared after the requirement is reviewed.
                </p>
              </Card>
            ) : null}

            <Card tone="navy">
              <p className="text-[14px] font-semibold">Discuss your requirement</p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">
                Share the relevant circumstances and the requirement will be reviewed before any
                engagement is accepted.
              </p>
              <Button
                href={p(`/contact?service=${service.slug}`)}
                variant="onNavy"
                size="sm"
                className="mt-4 w-full"
              >
                Submit Requirement
              </Button>
            </Card>

            {related.length > 0 ? (
              <Card>
                <p className="text-[14px] font-semibold text-ink">Related services</p>
                <ul className="mt-3 space-y-2.5">
                  {related.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={p(`/services/${item.slug}`)}
                        className="inline-block py-1 text-[13px] leading-snug text-ink-muted hover:text-navy"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </aside>
        </div>
      </Section>
    </>
  );
}
