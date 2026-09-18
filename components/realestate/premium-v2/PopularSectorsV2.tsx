import { MapPin } from "lucide-react";
import { compareSectors, sectorSlug } from "@/lib/register";
import { formatNumber } from "@/lib/format";
import { GpContainer, GpSection, GpEyebrow } from "./gp-primitives";
import RelatedCardsV2 from "./RelatedCardsV2";

/** Three rows of four in `RelatedCardsV2`'s default grid. */
const MAX_CARDS = 12;

/**
 * Sector discovery links, taken from the client's own inventory.
 *
 * This section used to hardcode twelve names and point each one at
 * `/properties?search=Sector 54`. Every card was dead: the search could not
 * match the bare "54" the column stores, and four of the twelve ("Palam
 * Vihar", "Sushant Lok", "DLF Phase 1", "DLF Phase 5") named pockets this
 * client has no listing and no locality row for at all. The list is derived
 * now so it cannot drift from what the site actually holds, and each card
 * links to the prerendered `/sectors/{n}` page.
 */
export default function PopularSectorsV2({
  sectors,
  p,
}: {
  /** Most-stocked first, as `getPropertySectorFacets` returns them. */
  sectors: { sector: string; count: number }[];
  p: (path: string) => string;
}) {
  // Most-stocked sectors are the ones worth surfacing, but they read as a
  // list once chosen — Sector 2 before Sector 63A, not 23 projects before 16.
  const top = sectors.slice(0, MAX_CARDS).sort((a, b) => compareSectors(a.sector, b.sector));
  if (top.length === 0) return null;

  return (
    <GpSection tone="cream">
      <GpContainer>
        <GpEyebrow>Browse Deeper</GpEyebrow>
        <h2 className="gp-section-title font-display mt-2 max-w-xl text-[color:var(--gp-ink)]">
          Popular sectors
        </h2>
        <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-[color:var(--gp-body)]">
          Looking for a specific sector rather than a whole corridor? Each one has its own record —
          developers, land area, unit availability and delivery status, straight from the HRERA
          register.
        </p>

        <RelatedCardsV2
          className="mt-8"
          items={top.map(({ sector, count }) => ({
            href: p(`/sectors/${sectorSlug(sector)}`),
            title: `Sector ${sector}`,
            subtitle: `${formatNumber(count)} registered ${count === 1 ? "project" : "projects"}`,
          }))}
          icon={MapPin}
        />
      </GpContainer>
    </GpSection>
  );
}
