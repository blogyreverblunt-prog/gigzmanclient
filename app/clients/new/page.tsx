import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { VERTICAL_IDS, getVerticalConfig } from "@/lib/verticals";
import { TEMPLATE_REGISTRY } from "@/lib/templates";
import CreateClientForm from "@/components/platform/CreateClientForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New client — Gigzman",
  robots: { index: false, follow: false },
};

/**
 * A static segment under `/clients/`, so it resolves ahead of
 * `/clients/[slug]`. `createClient` refuses "new" as a client ID for that
 * reason — a client with that slug would exist but be unreachable from the list.
 */
export default async function NewClientPage() {
  await requirePlatformAdmin("/clients/new");

  // Both lists come from the code-side registries rather than being typed out:
  // the set of industries and the set of templates the components actually exist
  // for are code facts, and a stale copy here would offer an option that cannot
  // render.
  const verticals = VERTICAL_IDS.map((id) => ({ id, label: getVerticalConfig(id).label }));
  const templates = Object.values(TEMPLATE_REGISTRY).map((template) => ({
    key: template.key,
    label: template.label,
  }));

  return (
    <div className="min-h-screen bg-tint px-5 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All clients
        </Link>
        <h1 className="display-md mt-3">New client</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-muted">
          This creates the client and puts its site live straight away. Only the three fields below
          are permanent; everything else is filled in afterwards.
        </p>

        <div className="mt-7">
          <CreateClientForm verticals={verticals} templates={templates} />
        </div>
      </div>
    </div>
  );
}
