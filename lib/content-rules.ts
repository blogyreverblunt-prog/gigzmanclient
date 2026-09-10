/**
 * The content rules that decide whether a site is fit to deliver.
 *
 * Extracted so `scripts/check-content.ts` and the dashboard's readiness panel
 * apply the same ones. Two implementations of "is this locality page thin?"
 * would disagree eventually, and the one the operator sees would be the wrong
 * one — they would deliver against a green panel while the pre-delivery script
 * said otherwise.
 *
 * No imports: the checker runs under `tsx` outside Next, the panel runs inside
 * it.
 */

/**
 * Minimum locality description length.
 *
 * A locality page whose only distinguishing content is a name swap is a doorway
 * page and an index-bloat liability — the reason `localities.description` is
 * called out in schema.ts. 120 characters is roughly a sentence and a half:
 * short enough that a genuine description clears it easily, long enough that a
 * templated one does not.
 */
export const MIN_LOCALITY_DESCRIPTION = 120;

export interface ThinLocality {
  slug: string;
  reason: string;
}

/**
 * Locality descriptions that are too short, or duplicated across localities.
 *
 * Duplicate detection is on normalised text, so whitespace and casing
 * differences do not disguise a copy-paste.
 */
export function findThinLocalities(
  items: { slug: string; description?: string | null }[],
): ThinLocality[] {
  const thin: ThinLocality[] = [];
  const seen = new Map<string, string>();

  for (const item of items) {
    const description = (item.description ?? "").trim();
    if (description.length < MIN_LOCALITY_DESCRIPTION) {
      thin.push({
        slug: item.slug,
        reason: `description is ${description.length} chars (min ${MIN_LOCALITY_DESCRIPTION})`,
      });
      continue;
    }
    const normalised = description.toLowerCase().replace(/\s+/g, " ");
    const duplicateOf = seen.get(normalised);
    if (duplicateOf) {
      thin.push({ slug: item.slug, reason: `description duplicates "${duplicateOf}"` });
    } else {
      seen.set(normalised, item.slug);
    }
  }

  return thin;
}
