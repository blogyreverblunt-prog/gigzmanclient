import { notFound } from "next/navigation";
import { marked } from "marked";
import Section from "@/components/ui/Section";
import PremiumV2LegalPage from "@/components/realestate/premium-v2/PremiumV2LegalPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { getFirmSettings, getLegalPage, getLegalPageSlugs } from "@/lib/content";
import { formatDate } from "@/lib/format";

/**
 * Every legal page a tenant has, prerendered.
 *
 * `dynamicParams = false` turns an unknown slug into a 404 instead of an
 * on-demand render. That is the honest behaviour — a legal page absent from
 * the database does not exist — and it is what lets this route ship as static
 * HTML with no server function behind it.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const rows = await getLegalPageSlugs(tenant.id);
    return rows.map((row) => ({ slug: row.slug }));
  });
}

export async function generateMetadata(props: PageProps<"/site/[tenant]/legal/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, page] = await Promise.all([
    getFirmSettings(tenant.id),
    getLegalPage(tenant.id, slug),
  ]);
  if (!page) return {};
  return { title: `${page.title} — ${settings?.firmName ?? ""}` };
}

export default async function LegalPage(props: PageProps<"/site/[tenant]/legal/[slug]">) {
  const { slug } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2LegalPage tenant={tenant} slug={slug} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const page = await getLegalPage(tenant.id, slug);

  if (!page) notFound();

  const html = page.body ? await marked.parse(page.body) : "";

  return (
    <Section tone="page" size="md">
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <a href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </a>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{page.title}</span>
        </nav>

        <h1 className="display-lg">{page.title}</h1>
        <p className="mt-3 text-[12px] text-ink-subtle">
          Last updated {formatDate(page.lastReviewedAt ?? page.updatedAt)}
        </p>

        <div
          className="prose-body mt-8 text-[15px]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </Section>
  );
}
