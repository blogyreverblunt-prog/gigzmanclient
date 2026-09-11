import { notFound } from "next/navigation";
import Section from "@/components/ui/Section";
import SectionHeader from "@/components/ui/SectionHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Illustration from "@/components/site/Illustration";
import PremiumV2UpdatesIndexPage from "@/components/realestate/premium-v2/PremiumV2UpdatesIndexPage";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getPublishedUpdates } from "@/lib/content";
import { formatDate } from "@/lib/format";

/**
 * Rendered per request: ?category= filters the update list, and `searchParams`
 * is a dynamic API. The parent layout sets `revalidate = 300`, so without
 * this the page throws DYNAMIC_SERVER_USAGE and 500s for every tenant.
 *
 * The sibling /properties route solves the same problem the other way —
 * `force-static` plus reading the query string client-side. That is the
 * better trade for a page under real traffic; this one is not.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/site/[tenant]/updates">) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Professional Updates — ${settings?.firmName ?? ""}`,
    description:
      "Notes on income tax, GST, TDS and compliance developments, reviewed before publication.",
  };
}

export default async function UpdatesPage(props: PageProps<"/site/[tenant]/updates">) {
  const searchParams = await props.searchParams;
  const activeCategory = typeof searchParams.category === "string" ? searchParams.category : null;

  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    return <PremiumV2UpdatesIndexPage tenant={tenant} searchParams={searchParams} />;
  }

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const updates = await getPublishedUpdates(tenant.id);

  const categories = [...new Set(updates.map((u) => u.category))];
  const visible = activeCategory
    ? updates.filter((u) => u.category === activeCategory)
    : updates;

  return (
    <>
      <Section tone="tint" size="md">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-subtle">
          <a href={p("/")} className="inline-block py-1 hover:text-navy">
            Home
          </a>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Professional Updates</span>
        </nav>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <SectionHeader
            eyebrow="Knowledge"
            title="Tax and compliance information for informed decisions."
            description="General updates on income tax, GST, TDS and corporate compliance. Each note records the applicable period and the source it draws on."
          />
          </div>
          <Illustration
            name="growth-blue"
            sizes="(max-width: 1024px) 55vw, 300px"
            className="mx-auto hidden h-auto w-full max-w-[280px] lg:block"
          />
        </div>

        {categories.length > 0 ? (
          <div className="mt-7 flex flex-wrap gap-2">
            <a
              href={p("/updates")}
              className={`min-h-[36px] rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                !activeCategory
                  ? "border-navy bg-navy text-white"
                  : "border-line-strong bg-surface text-ink-muted hover:border-navy"
              }`}
            >
              All updates
            </a>
            {categories.map((category) => (
              <a
                key={category}
                href={p(`/updates?category=${encodeURIComponent(category)}`)}
                className={`min-h-[36px] rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                  activeCategory === category
                    ? "border-navy bg-navy text-white"
                    : "border-line-strong bg-surface text-ink-muted hover:border-navy"
                }`}
              >
                {category}
              </a>
            ))}
          </div>
        ) : null}
      </Section>

      <Section tone="page" size="md">
        {visible.length === 0 ? (
          <p className="rounded-[10px] border border-line p-6 text-[14px] text-ink-muted">
            No updates published in this category yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((update) => (
              <Card key={update.id} href={p(`/updates/${update.slug}`)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{update.category}</Badge>
                  {update.status === "outdated" ? <Badge tone="danger">Superseded</Badge> : null}
                </div>

                <p className="mt-3 text-[15px] font-semibold leading-snug text-ink">
                  {update.title}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{update.excerpt}</p>

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
                  <span>{formatDate(update.publishedAt)}</span>
                  {update.applicableYear ? <span>· {update.applicableYear}</span> : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
