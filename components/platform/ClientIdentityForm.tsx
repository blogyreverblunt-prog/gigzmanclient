"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClientIdentity } from "@/lib/actions/platform-actions";
import {
  EffectNote,
  FeedbackBanner,
  Input,
  Panel,
  Row,
  SaveButton,
  Toggle,
  type Feedback,
} from "./form-primitives";

export interface IdentityProps {
  clientId: string;
  slug: string;
  verticalLabel: string;
  templateLabel: string;
  /** Set when a realestate row's `template_key` resolves to nothing — the site has no URL. */
  templateError: string | null;
  displayName: string;
  customDomain: string;
  isActive: boolean;
}

/**
 * Identity and routing.
 *
 * `slug` and `vertical` are rendered as text, not as disabled inputs, so they
 * are not part of the payload at all — and the action refuses a mismatch anyway,
 * because a disabled input is a UI convention and a Server Action is a POST
 * endpoint.
 */
export default function ClientIdentityForm(props: IdentityProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isActive, setIsActive] = useState(props.isActive);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateClientIdentity(formData);
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="clientId" value={props.clientId} />
      <FeedbackBanner feedback={feedback} />

      <Panel title="Identity and routing">
        <Row three>
          <ReadOnly label="Client ID" value={props.slug} />
          <ReadOnly label="Vertical" value={props.verticalLabel} />
          <ReadOnly label="Template" value={props.templateLabel} error={props.templateError} />
        </Row>
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          The client ID is in every URL of this client&rsquo;s site, and the vertical decides its
          navigation, footer and structured data — both are fixed after creation. The template is
          not editable here at all: changing it would restyle and re-route the whole site, and
          today the only alternative value is one that would 404 every page.
        </p>

        <Input
          name="displayName"
          label="Display name"
          defaultValue={props.displayName}
          required
          help="Used on this dashboard. The public site shows the firm name from Business details."
        />
        <Input
          name="customDomain"
          label="Custom domain"
          defaultValue={props.customDomain}
          help="A bare hostname, e.g. highproperties.in. Leave empty if the client has no domain of its own. Pointing DNS is a separate, human step."
        />

        <Toggle
          name="isActive"
          label="Active"
          checked={isActive}
          onChange={setIsActive}
          note="An inactive client is off the air: its public pages 404, its staff cannot sign in or save anything, its lead form stops writing, and it drops out of the sitemap."
          risk={
            isActive
              ? undefined
              : "This client is currently switched off. There is no delete control anywhere in this dashboard — deactivation is the reversible alternative."
          }
        />

        <EffectNote>
          Live within seconds of saving. A reactivated client&rsquo;s pages are reachable
          immediately and are prerendered again at the next deploy. A changed domain still needs
          its DNS pointed by hand.
        </EffectNote>
      </Panel>

      <SaveButton pending={pending} label="Save identity" />
    </form>
  );
}

function ReadOnly({
  label,
  value,
  error,
}: {
  label: string;
  value: string;
  error?: string | null;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] text-ink-muted">{label}</p>
      <p
        className={`min-h-[40px] rounded-[8px] border border-line bg-tint px-3 py-2.5 text-[13px] ${
          error ? "text-status-danger" : "text-ink"
        }`}
      >
        {value}
      </p>
      {error ? (
        <p className="mt-1 text-[11.5px] leading-relaxed text-status-danger">{error}</p>
      ) : null}
    </div>
  );
}
