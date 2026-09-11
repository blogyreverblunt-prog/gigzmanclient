"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy, ExternalLink, KeyRound, Search, UploadCloud } from "lucide-react";
import {
  FIELD,
  FeedbackBanner,
  Panel,
  Row,
  SaveButton,
  type Feedback,
} from "@/components/platform/form-primitives";
import { MANAGED_SOCIAL_KEYS } from "@/lib/platform/feature-copy";
import {
  createClient,
  lookupGooglePlace,
  saveClientDetails,
  type CreateClientResult,
} from "@/lib/actions/platform-actions";
import type { PlaceCandidate, PlaceDetails } from "@/lib/gbp/places";

/**
 * One screen for a client, whether it exists yet or not.
 *
 * This replaces a create wizard plus a six-panel edit screen. The split was the
 * more obvious design and it was the wrong one for the person doing the work:
 * creating a client landed them on a second page with sixteen more fields, and
 * the fields that matter most — name, logo, phone, address — were scattered
 * across panels with a save button each. Here the whole client is one form with
 * one save.
 *
 * The order is the argument. Identity and logo are what every client needs;
 * the Google lookup fills most of the rest in one press; and everything that
 * remains is behind a disclosure, for the client whose listing is thin or
 * missing. An operator who does nothing but type a name and press Create gets a
 * working site.
 */

/** Only what the operator can actually see and change. */
const BUSINESS_FIELDS = [
  "phone",
  "whatsapp",
  "email",
  "notificationEmail",
  "businessCategory",
  "addressLine",
  "locality",
  "region",
  "postalCode",
  "country",
  "latitude",
  "longitude",
  "googleMapsUrl",
  "tagline",
  "overview",
  "establishedYear",
  "firmRegistrationNumber",
] as const;

type BusinessField = (typeof BUSINESS_FIELDS)[number];
type Values = Record<string, string>;

const LABELS: Record<BusinessField, string> = {
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Public email",
  notificationEmail: "Enquiry email",
  businessCategory: "Business category",
  addressLine: "Address",
  locality: "City",
  region: "State",
  postalCode: "Postcode",
  country: "Country",
  latitude: "Latitude",
  longitude: "Longitude",
  googleMapsUrl: "Google Maps link",
  tagline: "Tagline",
  overview: "About",
  establishedYear: "Established",
  firmRegistrationNumber: "Registration number",
};

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export interface ClientFormProps {
  mode: "create" | "edit";
  verticals: { id: string; label: string }[];
  /** Present only when editing. */
  clientId?: string;
  slug?: string;
  vertical?: string;
  sitePath?: string;
  dashboardPath?: string;
  logoUrl?: string | null;
  /** Whether GOOGLE_PLACES_API_KEY is configured; the panel says so if not. */
  placesEnabled: boolean;
  initial: Values;
}

export default function ClientForm({
  mode,
  verticals,
  clientId,
  slug: existingSlug,
  vertical: existingVertical,
  sitePath,
  dashboardPath,
  logoUrl,
  placesEnabled,
  initial,
}: ClientFormProps) {
  const creating = mode === "create";

  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [created, setCreated] = useState<CreateClientResult["created"] | null>(null);
  const [copied, setCopied] = useState(false);

  const [values, setValues] = useState<Values>(initial);
  const [slug, setSlug] = useState(existingSlug ?? "");
  const [slugEdited, setSlugEdited] = useState(!creating);
  const [vertical, setVertical] = useState(existingVertical ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  if (created) {
    return <Handover created={created} copied={copied} setCopied={setCopied} />;
  }

  const shownLogo = logoPreview ?? logoUrl ?? null;

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          // Branched rather than a ternary on the result: only `createClient`
          // returns the one-time credentials, and collapsing the two return
          // types loses that on the way through.
          if (creating) {
            const result = await createClient(formData);
            setFeedback(result);
            if (result.ok && result.created) setCreated(result.created);
            return;
          }
          setFeedback(await saveClientDetails(formData));
        })
      }
      className="space-y-4"
    >
      <FeedbackBanner feedback={feedback} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}

      {/* ─────────────────────────────────────────────────────────── identity */}
      <Panel
        title="Identity"
        note={
          creating
            ? "The client ID is permanent — it is the web address. Everything else can be changed later."
            : "The client ID and industry are permanent; they are in every URL of this client's site."
        }
      >
        <Row>
          <div>
            <label htmlFor="firmName" className="mb-1.5 block text-[12px] text-ink-muted">
              Business name <span className="text-accent">*</span>
            </label>
            <input
              id="firmName"
              name="firmName"
              required
              value={values.firmName ?? ""}
              className={FIELD}
              onChange={(event) => {
                set("firmName", event.target.value);
                // Suggest a slug until the operator types one themselves; after
                // that, leave it alone. Silently rewriting a slug someone has
                // deliberately set is worse than an awkward suggestion.
                if (slugEdited) return;
                setSlug(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 120),
                );
              }}
            />
          </div>

          <div>
            <label htmlFor="slug" className="mb-1.5 block text-[12px] text-ink-muted">
              Client ID
            </label>
            <input
              id="slug"
              name="slug"
              required
              value={slug}
              readOnly={!creating}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              className={`${FIELD} font-mono ${creating ? "" : "bg-tint text-ink-muted"}`}
            />
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
              {creating ? (
                <>
                  Lowercase letters, numbers and hyphens. This becomes part of the site&rsquo;s web
                  address and <strong>cannot be changed later</strong>.
                </>
              ) : (
                "Permanent — it is in every URL of this site."
              )}
            </p>
          </div>
        </Row>

        {creating ? (
          <div className="sm:w-1/2 sm:pr-1.5">
            <label htmlFor="vertical" className="mb-1.5 block text-[12px] text-ink-muted">
              Industry <span className="text-accent">*</span>
            </label>
            <select
              id="vertical"
              name="vertical"
              required
              value={vertical}
              onChange={(event) => setVertical(event.target.value)}
              className={FIELD}
            >
              <option value="">Choose…</option>
              {verticals.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
              Decides which pages and screens the client gets. Cannot be changed later — the
              content tables differ by industry.
            </p>
          </div>
        ) : null}

        {/*
          No template picker. Every real-estate client gets the same template by
          design, so asking is a decision the operator cannot get right and can
          get wrong: a row whose key is not in TEMPLATE_REGISTRY 404s every page
          of its site. `createClient` still validates it server-side.
        */}
        {creating && vertical === "realestate" ? (
          <input type="hidden" name="templateKey" value="premium-v2" />
        ) : null}
      </Panel>

      {/* ───────────────────────────────────────────────────────────── logo */}
      <LogoPanel
        firmName={values.firmName ?? ""}
        shownLogo={shownLogo}
        onPick={(url) => setLogoPreview(url)}
      />

      {/* ──────────────────────────────────────── google business profile */}
      <GooglePanel enabled={placesEnabled} onApply={(place) => applyPlace(place, setValues)} />

      {/* ────────────────────────────────────────────────────────── advanced */}
      <details className="group rounded-[10px] border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-[14px] font-semibold text-ink">
          <span>
            All other details
            <span className="ml-2 text-[12px] font-normal text-ink-muted">
              open this if anything above is missing or wrong
            </span>
          </span>
          <span className="text-[12px] font-normal text-ink-muted group-open:hidden">Show</span>
          <span className="hidden text-[12px] font-normal text-ink-muted group-open:inline">
            Hide
          </span>
        </summary>

        <div className="space-y-3 border-t border-line p-5">
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Leave anything you do not know <strong>empty</strong>. An empty field renders nothing on
            the site; a guessed one publishes something untrue about a real business.
          </p>

          <Row>
            <Field name="phone" values={values} set={set} />
            <Field name="whatsapp" values={values} set={set} />
          </Row>
          <Row>
            <Field name="email" values={values} set={set} type="email" />
            <Field
              name="notificationEmail"
              values={values}
              set={set}
              type="email"
              help="Where enquiries from the site are sent. Empty means they go nowhere."
            />
          </Row>

          <Field name="addressLine" values={values} set={set} />
          <Row three>
            <Field name="locality" values={values} set={set} />
            <Field name="region" values={values} set={set} />
            <Field name="postalCode" values={values} set={set} />
          </Row>
          <Row three>
            <Field name="country" values={values} set={set} />
            <Field name="latitude" values={values} set={set} />
            <Field name="longitude" values={values} set={set} />
          </Row>
          <Field name="googleMapsUrl" values={values} set={set} />

          <Row>
            <Field name="businessCategory" values={values} set={set} />
            <Field name="establishedYear" values={values} set={set} />
          </Row>
          <Field name="tagline" values={values} set={set} />
          <div>
            <label htmlFor="overview" className="mb-1.5 block text-[12px] text-ink-muted">
              About
            </label>
            <textarea
              id="overview"
              name="overview"
              rows={4}
              value={values.overview ?? ""}
              onChange={(event) => set("overview", event.target.value)}
              className={`${FIELD} py-2.5`}
            />
          </div>
          <Field name="firmRegistrationNumber" values={values} set={set} />

          <div className="pt-1">
            <p className="mb-2 text-[12px] font-medium text-ink">Social links</p>
            <p className="mb-3 text-[11.5px] leading-relaxed text-ink-muted">
              Full URLs. Each one becomes a clickable icon in the site footer — and only the ones
              filled in here are shown, so an account the client does not have is never implied.
            </p>
            <Row>
              {MANAGED_SOCIAL_KEYS.map((key) => (
                <div key={key}>
                  <label
                    htmlFor={`social-${key}`}
                    className="mb-1.5 block text-[12px] text-ink-muted"
                  >
                    {SOCIAL_LABELS[key] ?? key}
                  </label>
                  <input
                    id={`social-${key}`}
                    name={`social-${key}`}
                    type="url"
                    placeholder="https://"
                    value={values[`social-${key}`] ?? ""}
                    onChange={(event) => set(`social-${key}`, event.target.value)}
                    className={FIELD}
                  />
                </div>
              ))}
            </Row>
          </div>
        </div>
      </details>

      {!creating && (sitePath || dashboardPath) ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          {sitePath ? (
            <a
              href={sitePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-navy hover:underline"
            >
              Open the site
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          {dashboardPath ? (
            <a
              href={dashboardPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-navy hover:underline"
            >
              Client dashboard
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </p>
      ) : null}

      <SaveButton
        pending={pending}
        label={
          pending ? (creating ? "Creating" : "Saving") : creating ? "Create client" : "Save changes"
        }
      />
    </form>
  );
}

/** One text input bound to the shared values map. */
function Field({
  name,
  values,
  set,
  type = "text",
  help,
}: {
  name: BusinessField;
  values: Values;
  set: (key: string, value: string) => void;
  type?: string;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-[12px] text-ink-muted">
        {LABELS[name]}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={values[name] ?? ""}
        onChange={(event) => set(name, event.target.value)}
        autoComplete="off"
        className={FIELD}
      />
      {help ? <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{help}</p> : null}
    </div>
  );
}

/**
 * The logo, previewed on both grounds it actually has to survive.
 *
 * A mark that reads fine on the operator's white screen can vanish against the
 * footer's dark green. Showing both before saving is the difference between
 * catching that here and the client catching it.
 */
function LogoPanel({
  firmName,
  shownLogo,
  onPick,
}: {
  firmName: string;
  shownLogo: string | null;
  onPick: (url: string | null) => void;
}) {
  return (
    <Panel
      title="Logo"
      note="One file. The favicon set and the social share card are generated from it — you do not need to supply those separately."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid flex-1 grid-cols-2 gap-3">
          <PreviewTile label="Site header" dark>
            {shownLogo ? (
              <LogoImage src={shownLogo} alt={firmName} />
            ) : (
              <span className="text-[11.5px] text-white/60">No logo</span>
            )}
          </PreviewTile>
          <PreviewTile label="Light background" dark={false}>
            {shownLogo ? (
              <LogoImage src={shownLogo} alt={firmName} />
            ) : (
              <span className="text-[11.5px] text-ink-muted">No logo</span>
            )}
          </PreviewTile>
        </div>

        <div className="sm:w-64">
          <label
            htmlFor="logo"
            className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-dashed border-line-strong px-3 text-[12.5px] text-ink hover:border-navy"
          >
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            Choose logo file
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            className="sr-only"
            // A hint to the file picker only — the action re-checks the type,
            // because `accept` constrains a dialog and not a POST.
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              onPick(file ? URL.createObjectURL(file) : null);
            }}
          />
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
            PNG, JPEG, WebP or SVG, up to 5MB. Empty space around the mark is trimmed
            automatically, so a padded logo and a tight one end up the same size on the page.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function PreviewTile({
  label,
  dark,
  children,
}: {
  label: string;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] text-ink-muted">{label}</p>
      <div
        className={`flex h-20 items-center justify-center rounded-[8px] border px-4 ${
          dark ? "border-navy bg-navy" : "border-line bg-surface"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * `unoptimized` and a plain height: the file is either a blob: URL that has not
 * been uploaded yet or an arbitrary client logo whose dimensions vary, and
 * `next/image` needs a declared ratio it cannot have for either.
 */
function LogoImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={220}
      height={64}
      unoptimized
      className="max-h-14 w-auto object-contain"
    />
  );
}

/**
 * Fetch a Google Business Profile and fill the form from it.
 *
 * Nothing is written to the database here, and nothing is filled in without the
 * operator pressing Use. That is the whole design: an autofill that saved on
 * fetch would put Google's idea of a business's address onto a real website
 * with nobody having read it, and Google is not always right about a small
 * firm's listing.
 */
function GooglePanel({
  enabled,
  onApply,
}: {
  enabled: boolean;
  onApply: (place: PlaceDetails) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [place, setPlace] = useState<PlaceDetails | null>(null);

  const run = (payload: FormData) =>
    startTransition(async () => {
      setNote(null);
      setCandidates([]);
      setPlace(null);
      const result = await lookupGooglePlace(payload);
      const outcome = result.outcome;
      if (!outcome) {
        setNote(result.message ?? "The lookup failed.");
        return;
      }
      if (outcome.ok) {
        setPlace(outcome.place);
        return;
      }
      setNote(outcome.message);
      if (outcome.kind === "ambiguous") setCandidates(outcome.candidates);
    });

  const search = () => {
    const payload = new FormData();
    payload.set("link", link);
    run(payload);
  };

  return (
    <Panel
      title="Fetch from Google"
      note="Paste the client's Google Maps link, or type the business name and city. Nothing is filled in until you press Use."
    >
      {!enabled ? (
        <p className="rounded-[8px] border border-dashed border-line-strong px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-muted">
          Google lookup is off — <code className="font-mono">GOOGLE_PLACES_API_KEY</code> is not
          set. Everything can still be filled in by hand under &ldquo;All other details&rdquo;.
        </p>
      ) : null}

      <div className="flex gap-2">
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          disabled={!enabled}
          placeholder="https://maps.app.goo.gl/… or “Acme Realty Gurugram”"
          className={`${FIELD} flex-1`}
          // Enter inside a nested control would submit the whole client form,
          // creating the client before the lookup had run.
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (enabled && link.trim()) search();
            }
          }}
        />
        <button
          type="button"
          onClick={search}
          disabled={!enabled || pending || !link.trim()}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[8px] bg-navy px-4 text-[13px] font-medium text-white disabled:opacity-40"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          {pending ? "Fetching" : "Fetch"}
        </button>
      </div>

      {note ? (
        <p className="rounded-[8px] bg-tint px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          {note}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <ul className="space-y-1.5">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => {
                  const payload = new FormData();
                  payload.set("placeId", candidate.id);
                  run(payload);
                }}
                className="w-full rounded-[8px] border border-line px-3.5 py-2.5 text-left text-[12.5px] hover:border-navy"
              >
                <span className="font-medium text-ink">{candidate.name}</span>
                <span className="block text-ink-muted">{candidate.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {place ? (
        <div className="rounded-[8px] border border-line bg-tint p-3.5">
          <p className="text-[13px] font-medium text-ink">{place.name}</p>
          {place.formattedAddress ? (
            <p className="mt-0.5 text-[12px] text-ink-muted">{place.formattedAddress}</p>
          ) : null}
          <dl className="mt-2.5 space-y-1 text-[12px]">
            {place.phone ? <Pair label="Phone" value={place.phone} /> : null}
            {place.businessCategory ? (
              <Pair label="Category" value={place.businessCategory} />
            ) : null}
            {place.website ? <Pair label="Website" value={place.website} /> : null}
          </dl>
          <button
            type="button"
            onClick={() => {
              onApply(place);
              setPlace(null);
              setNote("Filled in below. Check it, then save.");
            }}
            className="mt-3 inline-flex min-h-[36px] items-center rounded-[8px] border border-navy px-3.5 text-[12.5px] font-medium text-navy hover:bg-surface"
          >
            Use these details
          </button>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
            Ratings and reviews are never imported — ICAI prohibits them on a CA firm&rsquo;s own
            site, so they are not offered for any industry.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </div>
  );
}

/**
 * Copy a fetched place onto the form.
 *
 * Only fields Google actually returned are written; a null from Places must not
 * blank something the operator has already typed.
 */
function applyPlace(place: PlaceDetails, setValues: (fn: (v: Values) => Values) => void) {
  const patch: Values = {};
  const put = (key: string, value: string | null) => {
    if (value) patch[key] = value;
  };

  put("firmName", place.name);
  put("phone", place.phone);
  put("businessCategory", place.businessCategory);
  put("addressLine", place.addressLine);
  put("locality", place.locality);
  put("region", place.region);
  put("postalCode", place.postalCode);
  put("country", place.country);
  put("latitude", place.latitude);
  put("longitude", place.longitude);
  put("googleMapsUrl", place.googleMapsUrl);

  setValues((current) => ({ ...current, ...patch }));
}

/**
 * Shown in place of the form after a successful create, rather than
 * redirecting.
 *
 * The redirect was the obvious design and is wrong here: the generated admin
 * password exists exactly once, in the action's return value, and carrying it
 * through a redirect means putting a live credential in a query string — and so
 * in browser history, the referer header and every access log on the way.
 */
function Handover({
  created,
  copied,
  setCopied,
}: {
  created: NonNullable<CreateClientResult["created"]>;
  copied: boolean;
  setCopied: (value: boolean) => void;
}) {
  const credentials = `${created.adminEmail}\n${created.password}`;

  return (
    <div className="space-y-4">
      <Panel title={`Created ${created.slug}`} note="The site is live now.">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <a
            href={created.sitePath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-navy hover:underline"
          >
            Open the site
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <Link
            href={`/clients/${created.slug}`}
            className="font-medium text-navy hover:underline"
          >
            Edit this client
          </Link>
        </p>
      </Panel>

      <section className="rounded-[10px] border border-status-danger bg-status-danger-soft p-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-status-danger">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Dashboard sign-in — shown once
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-status-danger">
          This password is not stored anywhere in readable form and cannot be shown again. Copy it
          now. If it is lost, a new one has to be set directly in the database.
        </p>
        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-ink-muted">Email</dt>
            <dd className="font-mono text-ink">{created.adminEmail}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-ink-muted">Password</dt>
            <dd className="font-mono text-ink">{created.password}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(credentials).then(
              () => setCopied(true),
              // Clipboard access can be refused outright (permissions policy, or
              // a non-secure origin). The credentials are on screen either way,
              // so a failed copy must not look like a failed create.
              () => setCopied(false),
            );
          }}
          className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-status-danger px-3.5 text-[13px] font-medium text-status-danger hover:bg-surface"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Copied" : "Copy email and password"}
        </button>
      </section>

      <p className="text-[12px] text-ink-muted">
        <Link href="/" className="text-navy hover:underline">
          Back to all clients
        </Link>
      </p>
    </div>
  );
}
