import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { VERTICAL_IDS, getVerticalConfig } from "@/lib/verticals";
import { hasPlacesKey } from "@/lib/gbp/places";
import ClientForm from "@/components/platform/ClientForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New client — Gigzman",
  robots: { index: false, follow: false },
};

/**
 * A static segment under `/clients/`, so it resolves ahead of
 * `/clients/[slug]`. `createClient` refuses "new" as a client ID for that
 * reason — a client with that slug would exist but be unreachable from the list.
 *
 * The same form serves `/clients/[slug]`. What was a create wizard followed by a
 * six-panel edit screen is now one screen in two modes, so a field cannot exist
 * in one and be missing from the other.
 */
export default async function NewClientPage() {
  await requirePlatformAdmin("/clients/new");

  // From the code-side registry rather than typed out: the set of industries the
  // content tables and templates actually exist for is a code fact, and a stale
  // copy here would offer an option that cannot render.
  const verticals = VERTICAL_IDS.map((id) => ({ id, label: getVerticalConfig(id).label }));

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
          Creates the client and puts its site live straight away. Only the business name and
          client ID are required — fetch the rest from Google, or fill in what you know and leave
          the rest empty.
        </p>

        <div className="mt-7">
          <ClientForm
            mode="create"
            verticals={verticals}
            placesEnabled={hasPlacesKey()}
            initial={{}}
          />
        </div>
      </div>
    </div>
  );
}
