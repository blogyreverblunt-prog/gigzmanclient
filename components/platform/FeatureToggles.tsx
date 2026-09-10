"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { updateClientFeatures } from "@/lib/actions/platform-actions";
import {
  FEATURE_COPY,
  HOME_LOAN_DSA_REFUSAL,
  VASTU_TENANT_CAP,
  vastuDecision,
} from "@/lib/platform/feature-copy";
import {
  EffectNote,
  FeedbackBanner,
  Panel,
  SaveButton,
  Toggle,
  type Feedback,
} from "./form-primitives";

export interface FeatureTogglesProps {
  clientId: string;
  /**
   * The five flags as `featureEnabled(row, key)` resolved them server-side.
   * `featureEnabled` is the only read path for `clients.features`, and it is not
   * importable here as a value — so the resolution happens on the server and
   * arrives as plain booleans.
   */
  initial: Record<string, boolean>;
  /** Slugs that currently publish the vastu sector matrix, EXCLUDING this client. */
  vastuEnabledSlugs: string[];
}

export default function FeatureToggles(props: FeatureTogglesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({ ...props.initial });
  const [vastuAck, setVastuAck] = useState(false);
  const [dsaConfirmed, setDsaConfirmed] = useState(false);

  // Both confirmations are demanded on the TRANSITION only, exactly as the
  // action enforces them — re-saving this panel with a flag already on must not
  // ask again, or the confirmation stops being read.
  const vastuTurningOn = !props.initial.vastuSectors && flags.vastuSectors;
  const homeLoanTurningOn = !props.initial.homeLoan && flags.homeLoan;

  // The same pure function the action refuses with, evaluated WITHOUT the
  // acknowledgement, so the warning on screen and the message after Save cannot
  // disagree about the count or the route cost.
  const vastuWarning = vastuDecision(props.vastuEnabledSlugs, false);
  const vastuCapped = props.vastuEnabledSlugs.length >= VASTU_TENANT_CAP;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateClientFeatures(formData);
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="clientId" value={props.clientId} />
      <FeedbackBanner feedback={feedback} />

      <Panel
        title="Features"
        note="Which optional sections and page families this client publishes. Two of these are not preferences: home-loan pages assert a commercial relationship, and vastu sector pages have already failed a deployment."
      >
        <div className="space-y-2.5">
          {FEATURE_COPY.map((feature) => (
            <div key={feature.key} className="space-y-2">
              <Toggle
                name={feature.key}
                label={feature.label}
                checked={flags[feature.key]}
                onChange={(value) => setFlags((prev) => ({ ...prev, [feature.key]: value }))}
                note={`${feature.summary} ${feature.reasoning}`}
                risk={feature.effect}
              />

              {feature.key === "vastuSectors" && vastuTurningOn ? (
                <Callout>
                  <p className="text-[12px] leading-relaxed text-ink">
                    {vastuWarning.ok
                      ? "No other client publishes the sector matrix today, so this would be the first — no acknowledgement is required."
                      : vastuWarning.message}
                  </p>
                  {!vastuWarning.ok && !vastuCapped ? (
                    <label
                      htmlFor="vastuSectorsAck"
                      className="mt-2.5 flex items-start gap-2.5 text-[12.5px] text-ink"
                    >
                      <input
                        id="vastuSectorsAck"
                        name="vastuSectorsAck"
                        type="checkbox"
                        checked={vastuAck}
                        onChange={(event) => setVastuAck(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f2744]"
                      />
                      I have confirmed this addition with a person, and accept the extra build
                      output it adds for every other client on this deployment.
                    </label>
                  ) : null}
                  {vastuCapped ? (
                    <p className="mt-2.5 text-[12px] leading-relaxed text-status-danger">
                      There is no confirmation that lifts this. Turn the matrix off for another
                      client first.
                    </p>
                  ) : null}
                </Callout>
              ) : null}

              {feature.key === "homeLoan" && homeLoanTurningOn ? (
                <Callout>
                  <p className="text-[12px] leading-relaxed text-ink">{HOME_LOAN_DSA_REFUSAL}</p>
                  <label
                    htmlFor="homeLoanDsaConfirmed"
                    className="mt-2.5 flex items-start gap-2.5 text-[12.5px] text-ink"
                  >
                    <input
                      id="homeLoanDsaConfirmed"
                      name="homeLoanDsaConfirmed"
                      type="checkbox"
                      checked={dsaConfirmed}
                      onChange={(event) => setDsaConfirmed(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f2744]"
                    />
                    I confirm this client holds a DSA relationship with the lenders these pages
                    name.
                  </label>
                </Callout>
              ) : null}
            </div>
          ))}
        </div>

        <EffectNote>
          Switching a page family off takes it down within seconds. Switching one on makes its
          pages reachable within seconds — they render on first visit and are prerendered at the
          next deploy. Both confirmations above are enforced in the Server Action, so a direct
          POST gets the same answer this form does.
        </EffectNote>
      </Panel>

      <SaveButton pending={pending} label="Save features" />
    </form>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-7 flex items-start gap-2.5 rounded-[8px] border border-accent/30 bg-accent-soft px-3.5 py-3">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
