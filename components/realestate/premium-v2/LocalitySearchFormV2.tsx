"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { joinPath } from "@/lib/paths";
import { analytics } from "@/lib/analytics";
import { parseSectorQuery, sectorSlug } from "@/lib/register";

interface LocalityOption {
  name: string;
  slug: string;
}

export default function LocalitySearchFormV2({
  basePath,
  localityOptions,
  sectorOptions,
}: {
  basePath: string;
  localityOptions: LocalityOption[];
  /**
   * Sector labels this client actually has inventory in, as stored ("54",
   * "63A"). Checked before routing so an unstocked sector falls through to
   * search rather than landing on a 404 — /sectors/[sector] only renders the
   * sectors present in the register.
   */
  sectorOptions: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      router.push(joinPath(basePath, "/properties"));
      return;
    }

    // Three destinations, most specific first.
    //
    // A sector goes to its own /sectors/{n} page rather than to a filtered
    // listing: that page is prerendered, writes its heading and summary from
    // the sector's own register figures, and is the URL worth sharing and
    // ranking. The placeholder has invited a sector here all along, but the
    // term used to be handed to a free-text search that could not match the
    // bare "54" the column stores — so all 153 sectors returned nothing.
    const sectorTerm = parseSectorQuery(term);
    const sector = sectorTerm
      ? sectorOptions.find((label) => sectorSlug(label) === sectorTerm)
      : undefined;

    // Exact corridor name before a partial one, so "Sohna Road" cannot be
    // beaten by whichever entry happens to contain it first.
    const lower = term.toLowerCase();
    const locality =
      localityOptions.find((loc) => loc.name.toLowerCase() === lower) ??
      localityOptions.find((loc) => loc.name.toLowerCase().includes(lower));

    analytics.searchSubmit("localities_index");

    if (sector) {
      router.push(joinPath(basePath, `/sectors/${sectorSlug(sector)}`));
    } else if (locality) {
      router.push(joinPath(basePath, `/localities/${locality.slug}`));
    } else {
      // Anything else — a project name, an unstocked sector, a builder floor
      // address — still falls back to search rather than a dead end.
      router.push(joinPath(basePath, `/properties?search=${encodeURIComponent(term)}`));
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-stretch overflow-hidden rounded-[var(--gp-radius-sm)] border border-white/25 bg-white/95 focus-within:border-[color:var(--gp-gold-600)]"
    >
      <label htmlFor="gp-locality-search" className="sr-only">
        Search sector, locality or corridor
      </label>
      <input
        id="gp-locality-search"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search sector, locality or corridor…"
        className="min-h-[54px] min-w-0 flex-1 bg-transparent px-4 text-[14px] text-[color:var(--gp-ink)] focus:outline-none"
      />
      <button
        type="submit"
        className="inline-flex min-h-[54px] shrink-0 items-center justify-center gap-1.5 bg-[color:var(--gp-gold-600)] px-5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)] sm:px-6"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        Explore
      </button>
    </form>
  );
}
