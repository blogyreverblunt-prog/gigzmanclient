import type { firmSettings } from "@/lib/db/schema";

/**
 * The homepage title and description, composed from fields the operator has
 * already filled in rather than typed a second time as "SEO".
 *
 * The reasoning, because it is a deliberate refusal of an obvious feature: a
 * non-technical operator cannot write metadata for 39 page types and several
 * thousand generated pages, and a form that asks them to produces either empty
 * fields or one description pasted everywhere. Every other page family in this
 * codebase already generates its own metadata from its own data. The homepage
 * was the exception only because `seoTitle` happened to exist as a column.
 *
 * So the column stays, and changes meaning: **null means "use the generated
 * one"**, and a value means someone deliberately overrode it. Nothing may write
 * the generated text into the column — doing so freezes today's output and the
 * title silently stops tracking the business name, locality and category it was
 * built from.
 *
 * Per-vertical patterns, because the useful shape differs: an estate agency is
 * searched for by area, a practice by service and credential.
 */

type Settings = typeof firmSettings.$inferSelect;

/** Google truncates a title around here; the preview warns past it. */
export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 155;

export interface GeneratedMeta {
  title: string;
  description: string;
}

function sentence(parts: (string | null | undefined)[], join = " "): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(join);
}

/**
 * `extras` are counted from the client's own content, not asserted — the same
 * discipline the hero stats follow. A locality list makes "across Sector 65,
 * Sector 66 and 4 more" possible; without one the sentence simply omits it
 * rather than claiming coverage the site cannot show.
 */
export function generatedHomeMeta(
  settings: Pick<
    Settings,
    "firmName" | "tagline" | "overview" | "businessCategory" | "locality" | "region" | "establishedYear"
  > | null,
  vertical: string,
  extras: { localities?: string[]; serviceTitles?: string[] } = {},
): GeneratedMeta {
  const firm = settings?.firmName?.trim() || "";
  const place = settings?.locality?.trim() || settings?.region?.trim() || "";
  const category = settings?.businessCategory?.trim() || "";
  const since = settings?.establishedYear?.trim() || "";

  if (!firm) {
    // Nothing to build from. An empty string is honest: the page falls back to
    // its own <title>, and the readiness panel reports the missing name.
    return { title: "", description: "" };
  }

  const title =
    vertical === "realestate"
      ? sentence([firm, place ? `${category || "Real Estate"} in ${place}` : category], " — ")
      : sentence([firm, place ? `${category || "Chartered Accountants"} in ${place}` : category], " — ");

  // The overview is the client's own words about themselves, so it is the best
  // description available whenever it exists. The composed fallback only runs
  // when it does not.
  const overview = settings?.overview?.trim();
  const description = overview
    ? overview.replace(/\s+/g, " ").slice(0, DESCRIPTION_LIMIT)
    : buildDescription({ firm, place, category, since, vertical, extras });

  return { title: title.slice(0, TITLE_LIMIT + 20), description };
}

function buildDescription({
  firm,
  place,
  category,
  since,
  vertical,
  extras,
}: {
  firm: string;
  place: string;
  category: string;
  since: string;
  vertical: string;
  extras: { localities?: string[]; serviceTitles?: string[] };
}): string {
  const lead = sentence([
    firm,
    "—",
    category || (vertical === "realestate" ? "property advisers" : "chartered accountants"),
    place ? `in ${place}` : "",
    since ? `since ${since}` : "",
  ]);

  const coverage =
    vertical === "realestate" && extras.localities?.length
      ? ` Covering ${listOf(extras.localities)}.`
      : extras.serviceTitles?.length
        ? ` ${listOf(extras.serviceTitles)}.`
        : "";

  return `${lead}.${coverage}`.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_LIMIT);
}

function listOf(items: string[]): string {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const joined =
    shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return rest > 0 ? `${joined} and ${rest} more` : joined;
}

/** What the page should actually use: the override if set, else the generated one. */
export function resolveHomeMeta(
  settings: Parameters<typeof generatedHomeMeta>[0] & {
    seoTitle?: string | null;
    seoDescription?: string | null;
  },
  vertical: string,
  extras?: Parameters<typeof generatedHomeMeta>[2],
): GeneratedMeta {
  const generated = generatedHomeMeta(settings, vertical, extras);
  return {
    title: settings?.seoTitle?.trim() || generated.title,
    description: settings?.seoDescription?.trim() || generated.description,
  };
}
