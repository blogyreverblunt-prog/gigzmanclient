import type { FeatureKey } from "@/lib/features";

/**
 * On-screen copy and the two hard guards for the five `clients.features` flags,
 * plus the handful of small shared lists the platform screens need on both
 * sides of the server/client boundary.
 *
 * Imports nothing but the `FeatureKey` type (and `lib/features.ts` itself
 * imports nothing), so this file is safe in a Client Component's module graph:
 * `components/platform/FeatureToggles.tsx` renders the copy, and
 * `lib/actions/platform-actions.ts` refuses with the same strings. One source,
 * so the warning next to the switch and the refusal after it cannot drift apart.
 *
 * The prose below is condensed from the reasoning CD-02 deliberately left beside
 * each accessor — `lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`,
 * `lib/home-loan/enabled.ts`. Those comments remain the provenance; if one of
 * them changes, change the matching entry here.
 */

/**
 * The seven opening-hours rows, in the order they are stored and rendered.
 *
 * Here rather than in the action or the form because all three need it and none
 * may import the other two: the page builds the grid, the client form renders
 * it, the Server Action reads it back. One list, one order, so a save cannot
 * silently reorder a client's week.
 */
export const OPENING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * The social keys the platform form manages.
 *
 * Four, not the five §9 lists: these are the keys `FooterV2`'s
 * `SOCIAL_PLATFORMS` actually renders an icon for. Anything else stored on the
 * row — an `x` handle seeded from YAML, say, which still reaches `sameAs` in the
 * organisation JSON-LD — is left untouched, which is why the action MERGES
 * `social_links` rather than replacing it.
 */
export const MANAGED_SOCIAL_KEYS = ["instagram", "facebook", "linkedin", "youtube"] as const;

/**
 * How many tenants may carry the Gurugram sector vastu matrix at once.
 *
 * Not a preference. Three enabled tenants is a 32-minute production build; the
 * fourth pushed the deployment past its output limit and failed after a
 * 41-minute build. Exactly one tenant carries it today.
 */
export const VASTU_TENANT_CAP = 3;

/** Prerendered routes the sector matrix adds to every build, per tenant. */
export const VASTU_ROUTES_PER_TENANT = 3700;

/** `3,700` — grouped explicitly rather than by the machine's default locale. */
const ROUTES = VASTU_ROUTES_PER_TENANT.toLocaleString("en-US");

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export type VastuDecision = { ok: true } | { ok: false; message: string };

/**
 * Whether this tenant may switch vastu sector pages on.
 *
 * Pure, and in this file rather than inline in the action, for two reasons. It
 * is the single source for both the refusal message and the warning the form
 * renders, so the two cannot disagree about the count or the route cost. And the
 * cap branch is otherwise unreachable in a state anyone is willing to create —
 * three enabled tenants is a 32-minute build, and the fourth is the deploy that
 * failed after 41 minutes — so making it a function is what makes it testable at
 * all.
 *
 * `enabledSlugs` excludes the target. `acked` is the operator's explicit
 * acknowledgement, required for ANY new tenant, because
 * docs/client-dashboard-brief.md §11 reads as "one more than now", not as an
 * ordinal: exactly one tenant carries the matrix today.
 */
export function vastuDecision(enabledSlugs: string[], acked: boolean): VastuDecision {
  const count = enabledSlugs.length;
  const slugs = enabledSlugs.join(", ");

  if (count >= VASTU_TENANT_CAP) {
    return {
      ok: false,
      message:
        `Vastu sector pages are capped at ${VASTU_TENANT_CAP} tenants and ${count} already have them (${slugs}). ` +
        `Each tenant adds about ${ROUTES} prerendered routes; three is the most that has ever shipped, at a ` +
        `32-minute production build, and a fourth pushed the deployment past its output limit and failed after ` +
        `41 minutes. Turn it off for another tenant first.`,
    };
  }

  if (count >= 1 && !acked) {
    return {
      ok: false,
      message:
        `Enabling vastu sector pages here would make this the ${ordinal(count + 1)} tenant with them, adding about ` +
        `${ROUTES} prerendered routes to every build (currently ${count} ${count === 1 ? "tenant" : "tenants"}: ${slugs}). ` +
        `docs/client-dashboard-brief.md §11 lists this as a decision that needs a person. Tick the confirmation to proceed.`,
    };
  }

  return { ok: true };
}

/**
 * Refusal for `homeLoan` without the DSA confirmation. A constant rather than a
 * literal in the action, so the checkbox's own label can quote it exactly.
 */
export const HOME_LOAN_DSA_REFUSAL =
  "Home-loan pages state that the firm is an authorised channel partner. Confirm that this client holds a DSA " +
  "relationship before enabling them.";

/**
 * Refusal for any attempt to write `clients.features` on a tenant that is not a
 * real-estate client.
 *
 * All five flags gate premium-v2 real-estate surfaces, and until CD-02 the gates
 * were hardcoded `Set<string>` allowlists of real-estate slugs — so a `cafirm`
 * tenant could not be in one, and the scoping was implicit in the data
 * structure. CD-02 moved the answer to `clients.features` and CD-03a made that
 * row operator-editable; neither restored the scoping the Set had provided for
 * free. `homeLoan` is the flag that makes this a compliance matter rather than a
 * tidiness one: those pages display lender trademarks and describe the firm as
 * an authorised channel partner, which for a chartered-accountancy practice is
 * both a misrepresentation and squarely inside ICAI's advertising restrictions.
 */
export const FEATURES_REALESTATE_ONLY_REFUSAL =
  "These feature flags belong to the premium-v2 real-estate template, and this client is not a " +
  "real-estate tenant, so there is nothing here to configure for it. Home-loan pages in " +
  "particular state that the firm is an authorised channel partner of the lenders they name — " +
  "publishing that for a firm in another line of business would be a misrepresentation, and for " +
  "a chartered-accountancy practice an ICAI advertising breach as well.";

/** Refusal for `reviewsEnabled` on a chartered-accountancy tenant. */
export const ICAI_REVIEWS_REFUSAL =
  "Reviews and ratings cannot be enabled for a chartered-accountancy firm. ICAI's Code of Ethics prohibits " +
  "testimonials, star ratings and endorsements on a firm's own website.";

export interface FeatureCopy {
  key: FeatureKey;
  label: string;
  /** What the flag actually publishes. */
  summary: string;
  /** Why it is opt-in or opt-out — the reasoning CD-02 recorded beside the gate. */
  reasoning: string;
  /** When the change takes effect, stated plainly. Never claim "live" for a deploy-bound change. */
  effect: string;
}

export const FEATURE_COPY: FeatureCopy[] = [
  {
    key: "propertyMap",
    label: "Property map section",
    summary: '"Explore Properties on the Map" on the home page.',
    reasoning:
      "A styled placeholder, not a working map: decorative pins on a textured panel and map/satellite toggles " +
      "that switch nothing, pending the real Maps JS API. Opt-out — a client created with no features set gets " +
      "the section, which is what four of the five live real-estate tenants want. High Properties asked for it off.",
    effect: "Live within seconds of saving.",
  },
  {
    key: "propertyManagementSection",
    label: "Property-management section",
    summary: "The property-management block on the home page.",
    reasoning:
      "The artwork is not tenant-neutral: the phone mock, its screen and the logo on it are baked into the " +
      "supplied background images, so it reads as High Properties whoever renders it. Opt-in for that reason — a " +
      "second client gets the section when there is art carrying their own brand, not before.",
    effect: "Live within seconds of saving.",
  },
  {
    key: "propertyManagementPage",
    label: "Property-management page",
    summary: "The /property-management landing page.",
    reasoning:
      "Ships with High-Properties-branded art throughout — the hero phone and its screen, the inspector's " +
      "uniform, the owner-portal reference. Off, /property-management is a real 404 for this tenant rather than " +
      "an empty page.",
    effect: "Reachable within seconds of saving; prerendered at the next deploy.",
  },
  {
    key: "vastuSectors",
    label: "Vastu sector pages (Gurugram)",
    summary: `The Gurugram sector vastu matrix — about ${ROUTES} pages for this tenant.`,
    reasoning:
      `Build output, first: the matrix is about ${ROUTES} prerendered routes per tenant. At three tenants the ` +
      "production build took 32 minutes and shipped; a fourth pushed it past the deployment output limit and the " +
      "deploy failed after a 41-minute build. Content quality, second: the pages differ only by sector name and " +
      "the four corridor figures that sector's locality row supplies. The base vastu pages (facing, room, plot " +
      "size, property type) stay available to every real-estate tenant regardless of this switch.",
    effect: "Reachable within seconds of saving; prerendered at the next deploy.",
  },
  {
    key: "homeLoan",
    label: "Home-loan pages",
    summary: "The /home-loan family — amounts, lenders and eligibility pages.",
    reasoning:
      "These pages display lender trademarks and describe the firm as an authorised channel partner. That is " +
      "only true for a client who actually holds a DSA relationship; publishing it for one who does not is a " +
      "misrepresentation. Opt-in, behind a confirmation, for exactly that reason.",
    effect: "Reachable within seconds of saving; prerendered at the next deploy.",
  },
];
