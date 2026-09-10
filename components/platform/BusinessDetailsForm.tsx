"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { updateClientBusinessDetails } from "@/lib/actions/platform-actions";
import { MANAGED_SOCIAL_KEYS } from "@/lib/platform/feature-copy";
import {
  EffectNote,
  FIELD,
  FeedbackBanner,
  Input,
  Panel,
  Row,
  SaveButton,
  TextArea,
  Toggle,
  type Feedback,
} from "./form-primitives";

export interface HourRow {
  day: string;
  opens: string;
  closes: string;
  closed: boolean;
}

export interface BusinessDetailsProps {
  clientId: string;
  /** Resolved server-side from `getVerticalConfig(row.vertical).footer.registrationLabel`. */
  registrationLabel: string;
  /** True for a `cafirm` tenant: ICAI prohibits testimonials, ratings and endorsements. */
  reviewsLocked: boolean;
  values: {
    firmName: string;
    tagline: string;
    overview: string;
    establishedYear: string;
    firmRegistrationNumber: string;
    businessCategory: string;
    phone: string;
    whatsapp: string;
    email: string;
    notificationEmail: string;
    addressLine: string;
    locality: string;
    region: string;
    postalCode: string;
    country: string;
    latitude: string;
    longitude: string;
    googleMapsUrl: string;
  };
  hours: HourRow[];
  social: Record<(typeof MANAGED_SOCIAL_KEYS)[number], string>;
  /** Social keys stored on the row that this form does not render; listed so nobody assumes they were lost. */
  unmanagedSocialKeys: string[];
  sections: {
    reviewsEnabled: boolean;
    pricingEnabled: boolean;
    awardsEnabled: boolean;
    clientLogosEnabled: boolean;
    teamEnabled: boolean;
  };
}

const SOCIAL_LABELS: Record<(typeof MANAGED_SOCIAL_KEYS)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

/**
 * The section toggles, with the constraint that makes each one a decision rather
 * than a preference. Same list and same reasoning as the tenant dashboard's own
 * settings form — the restrictions apply to the practice, not to who is holding
 * the switch.
 */
const SECTIONS = [
  {
    name: "reviewsEnabled",
    label: "Reviews and ratings",
    risk: "ICAI prohibits testimonials, star ratings and endorsements on a chartered accountant's own website.",
  },
  {
    name: "pricingEnabled",
    label: "Pricing indications",
    risk: "ICAI prohibits publishing professional fees or offers of free service.",
  },
  {
    name: "clientLogosEnabled",
    label: "Client names and logos",
    risk: "ICAI prohibits naming clients or displaying client logos.",
  },
  {
    name: "awardsEnabled",
    label: "Awards and recognition",
    risk: "May read as a comparative or self-laudatory claim; review before enabling.",
  },
  { name: "teamEnabled", label: "Team profiles", risk: null },
] as const;

export default function BusinessDetailsForm(props: BusinessDetailsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hours, setHours] = useState<HourRow[]>(props.hours);
  const [flags, setFlags] = useState<Record<string, boolean>>({ ...props.sections });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateClientBusinessDetails(formData);
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="clientId" value={props.clientId} />
      <FeedbackBanner feedback={feedback} />

      <Panel
        title="Business identity"
        note="Every field here is published. Leave one empty rather than guessing — an empty field renders nothing, an invented one ships a claim about a real business."
      >
        <Row>
          <Input name="firmName" label="Firm name" defaultValue={props.values.firmName} required />
          <Input
            name="businessCategory"
            label="Business category"
            defaultValue={props.values.businessCategory}
          />
        </Row>
        <Row>
          <Input
            name="establishedYear"
            label="Year of establishment"
            defaultValue={props.values.establishedYear}
          />
          <Input
            name="firmRegistrationNumber"
            label={props.registrationLabel}
            defaultValue={props.values.firmRegistrationNumber}
            help="From the client's own registration certificate. Never inferred: a property listing without a RERA number is published with a visible registration-pending state instead."
          />
        </Row>
        <Input name="tagline" label="Tagline" defaultValue={props.values.tagline} />
        <TextArea name="overview" label="Overview" defaultValue={props.values.overview} rows={4} />
      </Panel>

      <Panel
        title="Contact"
        note="These must match the client's Google Business Profile exactly — they drive the footer, the contact page, the map and the structured data."
      >
        <Row>
          <Input name="phone" label="Phone" defaultValue={props.values.phone} />
          <Input name="whatsapp" label="WhatsApp" defaultValue={props.values.whatsapp} />
        </Row>
        <Row>
          <Input name="email" label="Email" type="email" defaultValue={props.values.email} />
          <Input
            name="notificationEmail"
            label="Enquiry notification email"
            type="email"
            defaultValue={props.values.notificationEmail}
            help="Where leads from this client's site are sent. Empty means nowhere."
          />
        </Row>
      </Panel>

      <Panel title="Address and location">
        <Input name="addressLine" label="Address" defaultValue={props.values.addressLine} />
        <Row three>
          <Input name="locality" label="Locality" defaultValue={props.values.locality} />
          <Input name="region" label="State" defaultValue={props.values.region} />
          <Input name="postalCode" label="PIN code" defaultValue={props.values.postalCode} />
        </Row>
        <Row three>
          <Input name="country" label="Country" defaultValue={props.values.country} />
          <Input
            name="latitude"
            label="Latitude"
            defaultValue={props.values.latitude}
            help="Decimal degrees. Both coordinates or neither."
          />
          <Input name="longitude" label="Longitude" defaultValue={props.values.longitude} />
        </Row>
        <Input
          name="googleMapsUrl"
          label="Google Maps link"
          defaultValue={props.values.googleMapsUrl}
        />
      </Panel>

      <Panel
        title="Opening hours"
        note="Drives both the contact page and the openingHoursSpecification in the structured data."
      >
        <div className="space-y-2">
          {hours.map((row, index) => (
            <div key={row.day} className="grid items-center gap-2 sm:grid-cols-[7rem_1fr_1fr_7rem]">
              <p className="text-[13px] text-ink">{row.day}</p>
              <input
                name={`hours-${row.day}-opens`}
                aria-label={`${row.day} opening time`}
                value={row.opens}
                disabled={row.closed}
                onChange={(event) => updateHour(setHours, index, { opens: event.target.value })}
                className={`${FIELD} disabled:opacity-50`}
              />
              <input
                name={`hours-${row.day}-closes`}
                aria-label={`${row.day} closing time`}
                value={row.closes}
                disabled={row.closed}
                onChange={(event) => updateHour(setHours, index, { closes: event.target.value })}
                className={`${FIELD} disabled:opacity-50`}
              />
              <label
                htmlFor={`hours-${row.day}-closed`}
                className="flex items-center gap-2 text-[12.5px] text-ink-muted"
              >
                <input
                  id={`hours-${row.day}-closed`}
                  name={`hours-${row.day}-closed`}
                  type="checkbox"
                  checked={row.closed}
                  onChange={(event) =>
                    updateHour(setHours, index, { closed: event.target.checked })
                  }
                  className="h-4 w-4 accent-[#0f2744]"
                />
                Closed
              </label>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Social links"
        note="Full profile URLs. These four are the ones the site renders an icon for; an empty field removes the link."
      >
        <Row>
          {MANAGED_SOCIAL_KEYS.map((key) => (
            <Input
              key={key}
              name={`social-${key}`}
              label={SOCIAL_LABELS[key]}
              defaultValue={props.social[key]}
            />
          ))}
        </Row>
        {props.unmanagedSocialKeys.length > 0 ? (
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            This client also has {props.unmanagedSocialKeys.join(", ")} stored. That is kept as it
            is — saving here merges the four fields above rather than replacing the whole set.
          </p>
        ) : null}
      </Panel>

      <Panel title="Section visibility">
        {props.reviewsLocked ? (
          <div className="flex items-start gap-2.5 rounded-[8px] border border-accent/30 bg-accent-soft px-3.5 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-[12px] leading-relaxed text-ink-muted">
              This is a chartered-accountancy firm, so reviews and ratings cannot be switched on
              here. ICAI&rsquo;s Code of Ethics prohibits testimonials, star ratings and
              endorsements on a firm&rsquo;s own website, and the Server Action refuses the whole
              save if the flag arrives set — the control below being disabled is a courtesy, not
              the enforcement.
            </p>
          </div>
        ) : null}

        <div className="space-y-2.5">
          {SECTIONS.map((section) => {
            const locked = props.reviewsLocked && section.name === "reviewsEnabled";
            return (
              <Toggle
                key={section.name}
                name={section.name}
                label={section.label}
                checked={locked ? false : flags[section.name]}
                disabled={locked}
                onChange={(value) => setFlags((prev) => ({ ...prev, [section.name]: value }))}
                risk={section.risk ?? undefined}
              />
            );
          })}
        </div>
      </Panel>

      <EffectNote>
        Live within seconds of saving — this client&rsquo;s pages are re-rendered on the next
        request. Logo, favicon and share images are not editable here; those are files and code
        today, and CD-05 owns them.
      </EffectNote>

      <SaveButton pending={pending} label="Save business details" />
    </form>
  );
}

function updateHour(
  setHours: React.Dispatch<React.SetStateAction<HourRow[]>>,
  index: number,
  patch: Partial<HourRow>,
) {
  setHours((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
}
