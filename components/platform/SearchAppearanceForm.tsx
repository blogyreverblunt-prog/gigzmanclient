"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  EffectNote,
  FIELD,
  FeedbackBanner,
  Panel,
  Row,
  SaveButton,
  type Feedback,
} from "@/components/platform/form-primitives";
import { updateClientSeo } from "@/lib/actions/platform-actions";
import { TITLE_LIMIT, DESCRIPTION_LIMIT } from "@/lib/seo/generated";

/**
 * The whole of "SEO", for someone who does not do SEO.
 *
 * Two paste-once technical fields, a preview of what Google will show, and an
 * override that stays shut unless someone deliberately opens it. There is no
 * keyword box and no per-page fields, because the rest of the site's metadata
 * is generated from its own content and always has been.
 */
export default function SearchAppearanceForm({
  clientId,
  generated,
  initial,
}: {
  clientId: string;
  generated: { title: string; description: string };
  initial: {
    seoTitle: string;
    seoDescription: string;
    ga4MeasurementId: string;
    searchConsoleVerification: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Opened by default only when an override already exists — otherwise a
  // collapsed section is a promise that the defaults are fine.
  const [overriding, setOverriding] = useState(
    Boolean(initial.seoTitle || initial.seoDescription),
  );
  const [title, setTitle] = useState(initial.seoTitle);
  const [description, setDescription] = useState(initial.seoDescription);

  const shownTitle = (overriding && title.trim()) || generated.title;
  const shownDescription = (overriding && description.trim()) || generated.description;

  return (
    <form
      action={(formData) =>
        startTransition(async () => setFeedback(await updateClientSeo(formData)))
      }
    >
      <input type="hidden" name="clientId" value={clientId} />
      <Panel
        title="Search appearance"
        note="How this client looks in Google results. Written for you from the business details — you only need to change it if you want to."
      >
        <FeedbackBanner feedback={feedback} />

        <div className="rounded-[8px] border border-line bg-tint p-4">
          <p className="mb-2 text-[11.5px] uppercase tracking-wide text-ink-muted">
            Google result preview
          </p>
          <p className="text-[16px] leading-snug text-[#1a0dab]">
            {shownTitle || <span className="text-ink-muted">No title yet</span>}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            {shownDescription || "No description yet"}
          </p>
          <div className="mt-2 flex gap-4 text-[11.5px]">
            <Count label="Title" length={shownTitle.length} limit={TITLE_LIMIT} />
            <Count label="Description" length={shownDescription.length} limit={DESCRIPTION_LIMIT} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOverriding((v) => !v)}
          className="flex items-center gap-1 text-[12.5px] font-medium text-navy hover:underline"
        >
          {overriding ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Write these myself
        </button>

        {overriding ? (
          <div className="space-y-3 rounded-[8px] border border-line-strong p-3.5">
            <div>
              <label htmlFor="seoTitle" className="mb-1.5 block text-[12px] text-ink-muted">
                Title
              </label>
              <input
                id="seoTitle"
                name="seoTitle"
                value={title}
                // Seeded from the generated text only as a placeholder, never as
                // a value: writing it into the field would persist today's
                // output and the title would stop tracking the business details
                // it is built from.
                placeholder={generated.title}
                onChange={(event) => setTitle(event.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="seoDescription" className="mb-1.5 block text-[12px] text-ink-muted">
                Description
              </label>
              <textarea
                id="seoDescription"
                name="seoDescription"
                rows={3}
                value={description}
                placeholder={generated.description}
                onChange={(event) => setDescription(event.target.value)}
                className={`${FIELD} py-2.5`}
              />
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Clear both boxes and save to go back to the written-for-you version.
            </p>
          </div>
        ) : (
          // The inputs must still post when the section is shut, or collapsing
          // it would silently clear an existing override on the next save.
          <>
            <input type="hidden" name="seoTitle" value={title} />
            <input type="hidden" name="seoDescription" value={description} />
          </>
        )}

        <Row>
          <div>
            <label htmlFor="ga4MeasurementId" className="mb-1.5 block text-[12px] text-ink-muted">
              Google Analytics measurement ID
            </label>
            <input
              id="ga4MeasurementId"
              name="ga4MeasurementId"
              defaultValue={initial.ga4MeasurementId}
              placeholder="G-XXXXXXXXXX"
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1 text-[11.5px] text-ink-muted">
              Google Analytics → Admin → Data streams.
            </p>
          </div>
          <div>
            <label
              htmlFor="searchConsoleVerification"
              className="mb-1.5 block text-[12px] text-ink-muted"
            >
              Search Console verification
            </label>
            <input
              id="searchConsoleVerification"
              name="searchConsoleVerification"
              defaultValue={initial.searchConsoleVerification}
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1 text-[11.5px] text-ink-muted">
              The content value of the HTML tag Google gives you.
            </p>
          </div>
        </Row>

        <EffectNote>
          Live within a few seconds. Google re-reads a page on its own schedule, so the result
          listing itself takes longer to change.
        </EffectNote>

        <SaveButton pending={pending} label={pending ? "Saving" : "Save search appearance"} />
      </Panel>
    </form>
  );
}

function Count({ label, length, limit }: { label: string; length: number; limit: number }) {
  const over = length > limit;
  const near = !over && length > limit * 0.85;
  return (
    <span className={over ? "text-status-danger" : near ? "text-ink" : "text-ink-muted"}>
      {label} {length}/{limit}
      {over ? " — will be cut off" : ""}
    </span>
  );
}
