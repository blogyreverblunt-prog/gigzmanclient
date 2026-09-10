"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Search } from "lucide-react";
import {
  EffectNote,
  FIELD,
  FeedbackBanner,
  Panel,
  SaveButton,
  type Feedback,
} from "@/components/platform/form-primitives";
import { lookupGooglePlace, applyGooglePlaceFields } from "@/lib/actions/platform-actions";
import type { PlaceCandidate, PlaceDetails, PlacesOutcome } from "@/lib/gbp/places";

/**
 * Paste the client's Google listing, review what came back, tick what is right.
 *
 * The review step is the feature, not friction around it. Google's data on a
 * small firm is often close but not exact — a name with a suffix nobody uses, a
 * category the owner picked years ago, an address missing a unit number — and
 * these fields go on a real business's website and into its structured data.
 * An autofill that wrote on fetch would publish all of that unread.
 *
 * Everything is pre-ticked EXCEPT where a value already exists and differs,
 * because overwriting something a human typed should be a deliberate act.
 */
export default function GbpAutofill({
  clientId,
  hasKey,
  current,
}: {
  clientId: string;
  hasKey: boolean;
  current: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const handle = (outcome: PlacesOutcome | undefined) => {
    if (!outcome) return;
    if (outcome.ok) {
      setPlace(outcome.place);
      setCandidates(null);
      setAccepted(defaultAccepted(outcome.place, current));
      setFeedback(null);
      return;
    }
    setPlace(null);
    setCandidates(outcome.kind === "ambiguous" ? outcome.candidates : null);
    setFeedback({ ok: false, message: outcome.message });
  };

  const lookup = (data: FormData) =>
    startTransition(async () => handle((await lookupGooglePlace(data)).outcome));

  return (
    <Panel
      title="Fill from Google"
      note="Paste the client's Google Maps listing and copy across what is right. Nothing is saved until you press Save."
    >
      <FeedbackBanner feedback={feedback} />

      {!hasKey ? (
        <p className="flex items-start gap-2 rounded-[8px] bg-tint px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          No Google Places API key is configured on this deployment, so lookup is switched off. Fill
          the business details in by hand — every field below is editable there.
        </p>
      ) : null}

      <form action={lookup} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[18rem] flex-1">
          <label htmlFor="link" className="mb-1.5 block text-[12px] text-ink-muted">
            Google Maps link, or the business name
          </label>
          <input
            id="link"
            name="link"
            disabled={!hasKey}
            placeholder="https://maps.app.goo.gl/…"
            className={`${FIELD} disabled:opacity-50`}
          />
        </div>
        <button
          type="submit"
          disabled={!hasKey || pending}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border border-line-strong px-3.5 text-[13px] font-medium text-ink-muted hover:border-navy hover:text-navy disabled:opacity-50"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          {pending ? "Looking up" : "Fetch"}
        </button>
      </form>

      {candidates ? (
        <div className="rounded-[8px] border border-line p-3.5">
          <p className="mb-2 text-[12.5px] text-ink">Which one is this client?</p>
          <ul className="space-y-1.5">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <form
                  action={(data) => {
                    data.set("placeId", candidate.id);
                    lookup(data);
                  }}
                >
                  <button type="submit" className="text-left text-[13px] text-navy hover:underline">
                    {candidate.name}
                    <span className="block text-[12px] text-ink-muted">{candidate.address}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {place ? (
        <form
          action={(data) =>
            startTransition(async () => {
              const result = await applyGooglePlaceFields(data);
              setFeedback(result);
              if (result.ok) setPlace(null);
            })
          }
          className="space-y-3"
        >
          <input type="hidden" name="clientId" value={clientId} />

          {place.businessStatus && place.businessStatus !== "OPERATIONAL" ? (
            <p className="flex items-start gap-2 rounded-[8px] bg-status-danger-soft px-3.5 py-2.5 text-[12.5px] text-status-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Google lists this business as {place.businessStatus.toLowerCase().replace(/_/g, " ")}.
              Check with the client before publishing anything from it.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-muted">
                  <th className="w-8 py-2" />
                  <th className="py-2 font-medium">Field</th>
                  <th className="py-2 font-medium">Currently</th>
                  <th className="py-2 font-medium">From Google</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label, of }) => {
                  const incoming = of(place);
                  if (!incoming) return null;
                  return (
                    <tr key={key} className="border-b border-line last:border-0 align-top">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          name="accept"
                          value={key}
                          checked={accepted.has(key)}
                          onChange={(event) =>
                            setAccepted((set) => {
                              const next = new Set(set);
                              if (event.target.checked) next.add(key);
                              else next.delete(key);
                              return next;
                            })
                          }
                          aria-label={`Use Google's ${label}`}
                        />
                        <input type="hidden" name={`value.${key}`} value={incoming} />
                      </td>
                      <td className="py-2 text-ink">{label}</td>
                      <td className="py-2 text-ink-muted">{current[key] || "—"}</td>
                      <td className="py-2 text-ink">{incoming}</td>
                    </tr>
                  );
                })}

                {place.openingHours ? (
                  <tr className="align-top">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        name="accept"
                        value="openingHours"
                        checked={accepted.has("openingHours")}
                        onChange={(event) =>
                          setAccepted((set) => {
                            const next = new Set(set);
                            if (event.target.checked) next.add("openingHours");
                            else next.delete("openingHours");
                            return next;
                          })
                        }
                        aria-label="Use Google's opening hours"
                      />
                      <input
                        type="hidden"
                        name="openingHours"
                        value={JSON.stringify(place.openingHours)}
                      />
                    </td>
                    <td className="py-2 text-ink">Opening hours</td>
                    <td className="py-2 text-ink-muted">—</td>
                    <td className="py-2 text-ink">
                      {place.openingHours.map((hour) => (
                        <span key={hour.day} className="block text-[12px]">
                          {hour.day}: {hour.closed ? "closed" : `${hour.opens}–${hour.closes}`}
                        </span>
                      ))}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="rounded-[8px] bg-tint px-3.5 py-3 text-[12px] leading-relaxed text-ink-muted">
            Google does not publish an email address, social profiles or a WhatsApp number, so those
            stay manual — leave them empty rather than guessing.
            {place.website ? (
              <>
                {" "}
                The listing points at <span className="text-ink">{place.website}</span>, so this
                client may already have a site.
              </>
            ) : null}
            {place.rating ? (
              <>
                {" "}
                It also carries a {place.rating}★ rating, which is deliberately not offered here:
                ICAI prohibits ratings on a practice&rsquo;s own website, and a star rating copied
                onto any client site is a claim we would then be publishing.
              </>
            ) : null}
          </p>

          <EffectNote>Live within a few seconds of saving.</EffectNote>
          <SaveButton pending={pending} label={pending ? "Saving" : "Save ticked fields"} />
        </form>
      ) : null}
    </Panel>
  );
}

const FIELDS: { key: string; label: string; of: (p: PlaceDetails) => string | null }[] = [
  { key: "firmName", label: "Business name", of: (p) => p.name || null },
  { key: "businessCategory", label: "Category", of: (p) => p.businessCategory },
  { key: "phone", label: "Phone", of: (p) => p.phone },
  { key: "whatsapp", label: "WhatsApp", of: (p) => p.phone },
  { key: "addressLine", label: "Address", of: (p) => p.addressLine },
  { key: "locality", label: "Town or city", of: (p) => p.locality },
  { key: "region", label: "State", of: (p) => p.region },
  { key: "postalCode", label: "PIN code", of: (p) => p.postalCode },
  { key: "country", label: "Country", of: (p) => p.country },
  { key: "latitude", label: "Latitude", of: (p) => p.latitude },
  { key: "longitude", label: "Longitude", of: (p) => p.longitude },
  { key: "googleMapsUrl", label: "Maps link", of: (p) => p.googleMapsUrl },
];

/**
 * Pre-tick the empty fields and leave conflicts alone.
 *
 * WhatsApp is never pre-ticked even when empty: Google supplies a phone number,
 * not a WhatsApp number, and the two are only usually the same. Offering it is
 * useful; assuming it is a guess about how a business takes messages.
 */
function defaultAccepted(place: PlaceDetails, current: Record<string, string>): Set<string> {
  const set = new Set<string>();
  for (const { key, of } of FIELDS) {
    if (key === "whatsapp") continue;
    const incoming = of(place);
    if (incoming && !current[key]) set.add(key);
  }
  if (place.openingHours) set.add("openingHours");
  return set;
}
