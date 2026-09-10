/**
 * Building a `wa.me` link that actually opens a chat.
 *
 * Every WhatsApp link in this codebase used to be `wa.me/${number.replace(/\D/g, "")}`,
 * which is wrong for every number we hold. `wa.me` takes a full international
 * number with no punctuation and no leading zero; what the clients supply is
 * how they write it locally:
 *
 *   "98215 53693"   -> 9821553693    10 digits, no country code
 *   "093520 04556"  -> 09352004556   11 digits, domestic trunk prefix
 *
 * Neither opens a chat. WhatsApp reports the number as not being on WhatsApp,
 * which reads to a visitor as "this firm is not on WhatsApp" rather than as a
 * broken link — so nobody reports it, and the enquiry is simply lost. This was
 * live on all six client sites.
 *
 * Two rules, both from how numbers are actually written:
 *
 *  1. **Drop a single leading zero.** It is a domestic trunk prefix and is
 *     never part of the international form.
 *  2. **Prefix the dialling code when the number is domestic-length.** A number
 *     that is already the right length for its country's international form is
 *     left alone, so a client who stores "919821553693" is not mangled into
 *     "91919821553693".
 *
 * `country` comes from `firm_settings.country`, which defaults to India. An
 * unrecognised country means the number is passed through as-is rather than
 * guessed at — better a link that behaves exactly as the stored number says
 * than one this file invented a country for.
 */

interface DialRule {
  /** International dialling code, no `+`. */
  code: string;
  /** Length of the local subscriber number, without trunk prefix or code. */
  localLength: number;
}

/**
 * Deliberately small. Every client is Indian today; adding a country here is a
 * one-line change when one is onboarded, and the fallback is to leave the
 * number untouched rather than to assume.
 */
const DIAL_RULES: Record<string, DialRule> = {
  india: { code: "91", localLength: 10 },
};

/**
 * The digits `wa.me` needs, or `null` when the number cannot be made into a
 * usable one. Callers must treat `null` as "no WhatsApp" and not render a link.
 */
export function whatsappDigits(
  raw: string | null | undefined,
  country?: string | null,
): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // A single trunk zero only. A number starting "00" is an international
  // prefix, which is a different thing and is left for the length check below.
  if (digits.startsWith("0") && !digits.startsWith("00")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);

  const rule = DIAL_RULES[(country ?? "India").trim().toLowerCase()];
  if (!rule) {
    // Unknown country: pass through. Too short to be any international number
    // is still worth refusing, because a 4-digit "number" is a data-entry slip
    // and a link to it is worse than no link.
    return digits.length >= 8 ? digits : null;
  }

  if (digits.length === rule.localLength) return `${rule.code}${digits}`;
  if (digits.startsWith(rule.code) && digits.length === rule.code.length + rule.localLength) {
    return digits;
  }

  // Neither local nor already-international length. Most likely a typo — a
  // missing or extra digit — so refuse rather than send a visitor to a stranger.
  return null;
}

/** Full `wa.me` URL, optionally with a prefilled message, or `null`. */
export function whatsappHref(
  raw: string | null | undefined,
  country?: string | null,
  message?: string,
): string | null {
  const digits = whatsappDigits(raw, country);
  if (!digits) return null;
  return message
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${digits}`;
}
