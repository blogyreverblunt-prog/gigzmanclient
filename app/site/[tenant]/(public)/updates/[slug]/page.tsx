import { notFound } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import { AlertTriangle, ExternalLink } from "lucide-react";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import PremiumV2UpdateDetailPage from "@/components/realestate/premium-v2/PremiumV2UpdateDetailPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getUpdate, getPublishedUpdates } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { buildArticleJsonLd, buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";

/** Prerenders every published market update for each tenant. */
export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const rows = await getPublishedUpdates(tenant.id);
    return rows.map((row) => ({ slug: row.slug }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/updates/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, update] = await Promise.all([
    getFirmSettings(tenant.id),
    getUpdate(tenant.id, slug),
  ]);
  if (!update) return {};
  return {
    title: update.seoTitle ?? `${update.title} — ${settings?.firmName ?? ""}`,
    description: update.seoDescription ?? update.excerpt ?? undefined,
  };
}

export default async function UpdateDetailPage(props: PageProps<"/site/[tenant]/updates/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2UpdateDetailPage tenant={tenant} slug={slug} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, update, all] = await Promise.all([
    getFirmSettings(tenant.id),
    getUpdate(tenant.id, slug),
    getPublishedUpdates(tenant.id),
  ]);

  // Drafts and archived notes must not be reachable by guessing the URL.
  if (!update || !["published", "outdated"].includes(update.status)) notFound();

  const html = update.body ? await marked.parse(update.body) : "";
  const related = all.filter((u) => u.id !== update.id && u.category === update.category).slice(0, 3);

  return (
    <>
      <script
        {...jsonLdProps(
          buildArticleJsonLd({
            title: update.title,
            description: update.excerpt,
            url: p(`/updates/${update.slug}`),
            publishedAt: update.publishedAt,
            updatedAt: update.updatedAt,
            authorName: update.authorName,
            publisherName: settings?.firmName ?? "",
          }),
        )}
      />
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Updates", url: p("/updates") },
            { name: update.title, url: p(`/updates/${update.slug}`) },
          ]),
        )}
      />

      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <Link href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={p("/updates")} className="inline-block py-1 hover:text-navy">
            Updates
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{update.category}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{update.category}</Badge>
          {update.applicableYear ? <Badge tone="neutral">{update.applicableYear}</Badge> : null}
        </div>

        <h1 className="display-xl mt-4 max-w-3xl">{update.title}</h1>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-subtle">
          <span>Published {formatDate(update.publishedAt)}</span>
          {update.lastReviewedAt ? (
            <span>· Last reviewed {formatDate(update.lastReviewedAt)}</span>
          ) : null}
          {update.reviewerName ? <span>· Reviewed by {update.reviewerName}</span> : null}
        </div>
      </Section>

      <Section tone="page" size="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px] lg:gap-14">
          <article>
            {update.status === "outdated" ? (
              <div className="mb-7 flex items-start gap-3 rounded-[10px] border border-status-danger/20 bg-status-danger-soft px-4 py-3.5">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-status-danger"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[13px] font-medium text-ink">This note has been superseded</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                    The position described here may have been amended or withdrawn. Confirm the
                    current position before acting on it.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="prose-body text-[15px]" dangerouslySetInnerHTML={{ __html: html }} />

            {update.sources && update.sources.length > 0 ? (
              <div className="mt-10 border-t border-line pt-5">
                <p className="text-[13px] font-semibold text-ink">Sources</p>
                <ul className="mt-2.5 space-y-1.5">
                  {update.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[26px] items-center gap-1 py-1 text-[13px] text-navy hover:underline"
                      >
                        {source.label}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-8 rounded-[10px] bg-accent-soft p-5 text-[12px] leading-relaxed text-ink-muted">
              This note is general information published for reference. It does not constitute
              professional advice and does not address the circumstances of any particular person or
              entity. Provisions referred to may have been amended after publication.
            </p>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card tone="navy">
              <p className="text-[14px] font-semibold">Discuss applicability</p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                Whether this applies to you depends on your circumstances.
              </p>
              <Button href={p("/contact")} variant="onNavy" size="sm" className="mt-4 w-full">
                Discuss Applicability
              </Button>
            </Card>

            {related.length > 0 ? (
              <Card>
                <p className="text-[14px] font-semibold text-ink">Related updates</p>
                <ul className="mt-3 space-y-3">
                  {related.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={p(`/updates/${item.slug}`)}
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
