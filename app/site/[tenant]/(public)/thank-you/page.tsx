import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";

export const metadata = {
  title: "Requirement received",
  robots: { index: false, follow: false },
};

/**
 * Rendered per request: ?ref= shows the submitted enquiry reference, and `searchParams`
 * is a dynamic API. The parent layout sets `revalidate = 300`, so without
 * this the page throws DYNAMIC_SERVER_USAGE and 500s for every tenant.
 *
 * The sibling /properties route solves the same problem the other way —
 * `force-static` plus reading the query string client-side. That is the
 * better trade for a page under real traffic; this one is not.
 */
export const dynamic = "force-dynamic";

export default async function ThankYouPage(props: PageProps<"/site/[tenant]/thank-you">) {
  const searchParams = await props.searchParams;
  const reference = typeof searchParams.ref === "string" ? searchParams.ref : null;

  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const settings = await getFirmSettings(tenant.id);

  return (
    <Section tone="tint" size="lg">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success-soft">
          <CheckCircle2 className="h-6 w-6 text-status-success" aria-hidden="true" />
        </span>

        <h1 className="display-lg mt-6">Your requirement has been received.</h1>
        <p className="prose-body mt-4 text-[15px]">
          The firm will review what you have shared and respond using the contact method you
          selected.
        </p>

        {reference ? (
          <div className="mt-7 inline-flex flex-col items-center rounded-[10px] border border-line bg-surface px-6 py-4">
            <p className="text-[12px] text-ink-subtle">Your reference</p>
            <p className="mt-1 font-mono text-[16px] font-semibold tracking-wide text-ink">
              {reference}
            </p>
          </div>
        ) : null}

        <p className="mt-7 text-[13px] leading-relaxed text-ink-muted">
          Please quote this reference in any follow-up. Submitting this form does not create a
          professional relationship — an engagement begins only after the requirement is reviewed
          and terms are agreed in writing.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={p("/")} variant="secondary">
            Return home
          </Button>
          {settings?.phone ? (
            <Button href={`tel:${settings.phone.replace(/\s/g, "")}`} external>
              Call {settings.phone}
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
