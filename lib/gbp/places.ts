import type { OpeningHour } from "@/lib/db/schema";
import { OPENING_DAYS } from "@/lib/platform/feature-copy";

/**
 * Pulling a client's details off their Google listing.
 *
 * **Why the Places API and not the Business Profile API.** The Business Profile
 * API returns the listing as its *owner* sees it, and requires OAuth as that
 * owner. We are not the owner — the client is — so that route would mean
 * walking every client through a consent screen. Places returns the listing as
 * the public sees it, which is the same data that is going on their website
 * anyway.
 *
 * **Why a Text Search first.** A pasted Maps URL is not a queryable identifier.
 * The `ftid`/`cid` hex in one is Google's internal id and is not officially
 * convertible to a `place_id`; building on it would work until it did not. So
 * the name and coordinates are pulled out of the URL and used to search, which
 * is a documented path.
 *
 * **What Google does not have**, and therefore what stays manual however good
 * this gets: email address, social profiles, WhatsApp number. Listings do not
 * publish them. Leaving those fields empty is correct — an invented email on a
 * real business's contact page is worse than no email.
 */

export interface PlaceCandidate {
  id: string;
  name: string;
  address: string;
}

export interface PlaceDetails {
  id: string;
  name: string;
  formattedAddress: string | null;
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  googleMapsUrl: string | null;
  businessCategory: string | null;
  website: string | null;
  rating: number | null;
  userRatingCount: number | null;
  businessStatus: string | null;
  openingHours: OpeningHour[] | null;
}

export type PlacesOutcome =
  | { ok: true; place: PlaceDetails }
  | { ok: false; kind: "no-key" | "bad-link" | "no-match" | "quota" | "error"; message: string }
  | { ok: false; kind: "ambiguous"; message: string; candidates: PlaceCandidate[] };

const ENDPOINT = "https://places.googleapis.com/v1";

/**
 * The exact fields requested. Places bills by field mask, so asking for
 * everything costs more than asking for what is used — and every field here
 * maps to a column in `firm_settings`.
 */
const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "googleMapsUri",
  "primaryTypeDisplayName",
  "websiteUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "regularOpeningHours",
].join(",");

export function hasPlacesKey(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/**
 * A short `maps.app.goo.gl` link carries nothing usable until it is followed.
 * `redirect: "manual"` so the Location header can be read without fetching the
 * (large, irrelevant) Maps page itself.
 */
async function expandShortLink(url: string): Promise<string> {
  if (!/(^|\/\/)(maps\.app\.goo\.gl|goo\.gl)\//.test(url)) return url;
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.headers.get("location") ?? url;
  } catch {
    return url;
  }
}

/** Business name and coordinates, as far as they can be read out of a Maps URL. */
function parseMapsUrl(url: string): { query: string | null; lat: number | null; lng: number | null } {
  let query: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;

  const place = url.match(/\/maps\/place\/([^/@?]+)/);
  if (place) query = decodeURIComponent(place[1]).replace(/\+/g, " ");

  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get("q") ?? parsed.searchParams.get("query");
    if (q && !/^[-\d.]+,[-\d.]+$/.test(q)) query = q;
  } catch {
    // Not a URL at all — treated as a plain search string below.
  }

  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    lat = Number(at[1]);
    lng = Number(at[2]);
  }
  return { query, lat, lng };
}

export async function lookupPlace(rawInput: string): Promise<PlacesOutcome> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return {
      ok: false,
      kind: "no-key",
      message:
        "No Google Places API key is configured, so this cannot look anything up. Fill the fields in by hand, or set GOOGLE_PLACES_API_KEY.",
    };
  }

  const input = rawInput.trim();
  if (!input) {
    return { ok: false, kind: "bad-link", message: "Paste a Google Maps link or a business name." };
  }

  const expanded = await expandShortLink(input);
  const { query, lat, lng } = parseMapsUrl(expanded);
  // A pasted business name is as good a search as a URL, so a link that yields
  // no name is not an error until the search itself fails.
  const textQuery = query ?? (expanded.startsWith("http") ? null : expanded);

  if (!textQuery) {
    return {
      ok: false,
      kind: "bad-link",
      message:
        "That link does not name a business. Open the listing in Google Maps and copy the URL from the address bar, or type the business name instead.",
    };
  }

  try {
    const response = await fetch(`${ENDPOINT}/places:searchText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": `places.${DETAIL_FIELDS.split(",").join(",places.")}`,
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 3,
        ...(lat !== null && lng !== null
          ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 500 } } }
          : {}),
      }),
    });

    if (response.status === 429) {
      return {
        ok: false,
        kind: "quota",
        message: "Google's rate limit was hit. Wait a minute and try again, or fill it in by hand.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        kind: "error",
        message: `Google returned ${response.status}. Fill the fields in by hand.`,
      };
    }

    const body = (await response.json()) as { places?: RawPlace[] };
    const places = body.places ?? [];

    if (places.length === 0) {
      return {
        ok: false,
        kind: "no-match",
        message: `Nothing on Google matched "${textQuery}". Check the link, or enter the details by hand.`,
      };
    }

    // More than one plausible match is not an error — it is a question. Guessing
    // would put another business's address on this client's site.
    if (places.length > 1 && !(lat !== null && lng !== null)) {
      return {
        ok: false,
        kind: "ambiguous",
        message: "More than one business matched. Pick the right one.",
        candidates: places.map((p) => ({
          id: p.id,
          name: p.displayName?.text ?? "(no name)",
          address: p.formattedAddress ?? "",
        })),
      };
    }

    return { ok: true, place: toDetails(places[0]) };
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      message: `Could not reach Google: ${(error as Error).message}. Fill the fields in by hand.`,
    };
  }
}

/** Fetch one specific place, after the operator has resolved an ambiguity. */
export async function fetchPlaceById(placeId: string): Promise<PlacesOutcome> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { ok: false, kind: "no-key", message: "No Google Places API key is configured." };

  try {
    const response = await fetch(`${ENDPOINT}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_FIELDS },
    });
    if (!response.ok) {
      return { ok: false, kind: "error", message: `Google returned ${response.status}.` };
    }
    return { ok: true, place: toDetails((await response.json()) as RawPlace) };
  } catch (error) {
    return { ok: false, kind: "error", message: `Could not reach Google: ${(error as Error).message}` };
  }
}

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: {
    periods?: {
      open?: { day?: number; hour?: number; minute?: number };
      close?: { day?: number; hour?: number; minute?: number };
    }[];
  };
}

function component(place: RawPlace, type: string, short = false): string | null {
  const found = place.addressComponents?.find((c) => c.types?.includes(type));
  return (short ? found?.shortText : found?.longText) ?? null;
}

function toDetails(place: RawPlace): PlaceDetails {
  // The street address is the formatted address minus the components that have
  // their own columns — otherwise the town, state and PIN appear twice on the
  // contact page, once in `addressLine` and once in their own fields.
  const tail = [
    component(place, "locality"),
    component(place, "administrative_area_level_1"),
    component(place, "postal_code"),
    component(place, "country"),
  ].filter(Boolean) as string[];

  let addressLine = place.formattedAddress ?? null;
  if (addressLine) {
    const parts = addressLine
      .split(",")
      .map((p) => p.trim())
      .filter((p) => !tail.some((t) => p === t || p === `${t}`) && !/^\d{6}$/.test(p));
    addressLine = parts.join(", ") || place.formattedAddress || null;
  }

  return {
    id: place.id,
    name: place.displayName?.text ?? "",
    formattedAddress: place.formattedAddress ?? null,
    addressLine,
    locality: component(place, "locality"),
    region: component(place, "administrative_area_level_1"),
    postalCode: component(place, "postal_code"),
    country: component(place, "country"),
    latitude: place.location?.latitude != null ? String(place.location.latitude) : null,
    longitude: place.location?.longitude != null ? String(place.location.longitude) : null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    googleMapsUrl: place.googleMapsUri ?? null,
    businessCategory: place.primaryTypeDisplayName?.text ?? null,
    website: place.websiteUri ?? null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    businessStatus: place.businessStatus ?? null,
    openingHours: toOpeningHours(place),
  };
}

/**
 * Google returns the whole week as periods, not just today — the "only today's
 * hours" limitation belongs to scraping the Maps page, not to this API.
 *
 * Days with no period are `closed: true` rather than absent, because the
 * template renders a seven-row table and a missing day would shift the rest.
 */
function toOpeningHours(place: RawPlace): OpeningHour[] | null {
  const periods = place.regularOpeningHours?.periods;
  if (!periods || periods.length === 0) return null;

  // Google numbers days 0 = Sunday; OPENING_DAYS starts at Monday.
  const byDay = new Map<number, { opens: string; closes: string }>();
  for (const period of periods) {
    const day = period.open?.day;
    if (day == null) continue;
    byDay.set(day, {
      opens: hhmm(period.open?.hour, period.open?.minute),
      closes: hhmm(period.close?.hour, period.close?.minute),
    });
  }

  return OPENING_DAYS.map((label, index) => {
    const googleDay = (index + 1) % 7;
    const period = byDay.get(googleDay);
    return period
      ? { day: label, opens: period.opens, closes: period.closes, closed: false }
      : { day: label, opens: null, closes: null, closed: true };
  });
}

function hhmm(hour: number | undefined, minute: number | undefined): string {
  return `${String(hour ?? 0).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}
