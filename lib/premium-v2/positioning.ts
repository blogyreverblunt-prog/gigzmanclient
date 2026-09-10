/**
 * What the home page's hero says, per client.
 *
 * The template was written for a general Gurugram agency, so its hero copy
 * ("Curated Addresses. Considered Living.", RERA-verified listings, families
 * placed) assumes apartments and a resale brokerage. Evergreen sells farm
 * houses and land in the Sohna belt, where none of that is the pitch — so the
 * headline, the supporting line and the labels on the trust row are chosen
 * here rather than hardcoded in the component.
 *
 * The trust row's *values* are not in this file: they are counted from the
 * client's own inventory at render time, so they cannot drift away from what
 * the site is actually showing.
 */
import {
  HERO_STAT_COUNT,
  STAT_ICONS,
  type HeroCopyValue,
  type HeroStatValue,
  type StatIcon,
  type StatKind,
} from "@/lib/premium-v2/hero-copy-types";

// Re-exported so existing importers of this module keep working; the shapes
// themselves live in a no-import module because lib/db/schema.ts types the
// `clients.hero_copy` column with them.
export { HERO_STAT_COUNT, STAT_ICONS };
export type { StatKind, StatIcon };
export type HeroStat = HeroStatValue;
export type HeroCopy = HeroCopyValue;

const DEFAULT: HeroCopy = {
  eyebrow: "Gurugram Real Estate, Reimagined",
  headline: ["Curated Addresses.", "Considered Living."],
  blurb:
    "{firm} brings verified inventory, corridor-level intelligence and dedicated advisors together, so every decision in Gurugram real estate is made with clarity.",
  searchPlaceholder: "Your mobile number",
  stats: [
    { kind: "claim", value: "12+", label: "Years Local Expertise", icon: "Award" },
    { kind: "claim", value: "500+", label: "Families Placed", icon: "Users" },
    { kind: "corridors", label: "Corridors Tracked", icon: "Signpost" },
    { kind: "claim", value: "100%", label: "RERA-Verified Listings", icon: "ShieldCheck" },
  ],
};

/**
 * The evergreen-real-estate copy that used to live in `BY_CLIENT` is now on
 * that client's row (migration 0009). `DEFAULT` above stays in code as the
 * fallback: a client created from the wizard has `hero_copy` null and gets a
 * working hero with no data entry at all.
 */
export function heroCopyFor(
  tenant: { heroCopy?: HeroCopy | null } | null | undefined,
  firmName: string,
): HeroCopy {
  const stored = tenant?.heroCopy;
  // Shape-checked rather than trusted: jsonb has no type checking, and a hand
  // edited row with three stats would break the four-tile layout. Anything
  // that does not look right falls back whole rather than being patched
  // field by field, which would produce a hero half from each source.
  const copy = isHeroCopy(stored) ? stored : DEFAULT;
  return { ...copy, blurb: copy.blurb.replace("{firm}", firmName) };
}

function isHeroCopy(value: unknown): value is HeroCopy {
  if (!value || typeof value !== "object") return false;
  const copy = value as Partial<HeroCopy>;
  return (
    typeof copy.eyebrow === "string" &&
    Array.isArray(copy.headline) &&
    copy.headline.length === 2 &&
    typeof copy.blurb === "string" &&
    typeof copy.searchPlaceholder === "string" &&
    Array.isArray(copy.stats) &&
    copy.stats.length === HERO_STAT_COUNT &&
    copy.stats.every(
      (stat) =>
        stat &&
        typeof stat.label === "string" &&
        STAT_ICONS.includes(stat.icon as never),
    )
  );
}

/** The template default, for seeding an editor that has nothing stored yet. */
export function defaultHeroCopy(): HeroCopy {
  return structuredClone(DEFAULT);
}
