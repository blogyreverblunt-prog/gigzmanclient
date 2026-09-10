/**
 * The stored shape of a client's hero copy.
 *
 * Split from `lib/premium-v2/positioning.ts` so `lib/db/schema.ts` can type the
 * column without importing template code — schema.ts is reached from scripts
 * that run outside Next, and positioning.ts is reached from a Client Component.
 * A type-only module with no imports is safe in both graphs.
 */

export type StatKind = "listings" | "corridors" | "medianPlot" | "medianPrice" | "claim";

export const STAT_ICONS = [
  "Award",
  "Users",
  "Signpost",
  "ShieldCheck",
  "Trees",
  "Ruler",
  "IndianRupee",
] as const;

export type StatIcon = (typeof STAT_ICONS)[number];

export interface HeroStatValue {
  kind: StatKind;
  label: string;
  /**
   * Only meaningful for `claim`. Every other kind is COUNTED from the client's
   * own inventory at render time, precisely so the number on the page cannot
   * drift from what the site is actually showing — so a stored value for one
   * would be a second, unreconciled source of truth.
   */
  value?: string;
  icon: StatIcon;
}

export interface HeroCopyValue {
  eyebrow: string;
  /** Two lines, rendered on separate rows. */
  headline: [string, string];
  /**
   * A string template with a `{firm}` placeholder, NOT a function. The resolved
   * copy is handed to `HeroV2`, which is a Client Component, and functions
   * cannot cross that boundary.
   */
  blurb: string;
  searchPlaceholder: string;
  /** Exactly four; the layout is a four-tile row. */
  stats: HeroStatValue[];
}

export const HERO_STAT_COUNT = 4;
