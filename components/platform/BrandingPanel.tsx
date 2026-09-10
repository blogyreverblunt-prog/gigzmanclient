"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { UploadCloud } from "lucide-react";
import {
  EffectNote,
  FeedbackBanner,
  Panel,
  SaveButton,
  type Feedback,
} from "@/components/platform/form-primitives";
import { uploadClientBranding } from "@/lib/actions/platform-actions";

/**
 * One upload, previewed the way the site will actually use it.
 *
 * The preview is the point. A logo looks fine on the operator's desktop and
 * then disappears against the footer's dark ground, or turns out to be a
 * white-on-transparent mark that is invisible in the header. Showing it on both
 * grounds before saving is the difference between catching that here and
 * catching it after the client does.
 */
export default function BrandingPanel({
  clientId,
  firmName,
  logoUrl,
  iconBaseUrl,
  ogImageUrl,
}: {
  clientId: string;
  firmName: string;
  logoUrl: string | null;
  iconBaseUrl: string | null;
  ogImageUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ?? logoUrl;

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setFeedback(await uploadClientBranding(formData));
          // The stored URL changes on success, so the object URL preview has
          // done its job; clearing it lets the saved file take over.
          setPreview(null);
        })
      }
    >
      <input type="hidden" name="clientId" value={clientId} />
      <Panel
        title="Logo and brand assets"
        note="Upload the client's logo once. The favicon set and the social share card are generated from it — you do not need to supply those separately."
      >
        <FeedbackBanner feedback={feedback} />

        {shown ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewTile label="On the site header" dark={false}>
              <LogoImage src={shown} alt={firmName} />
            </PreviewTile>
            <PreviewTile label="On the footer" dark>
              <LogoImage src={shown} alt={firmName} />
            </PreviewTile>
          </div>
        ) : (
          <p className="rounded-[8px] border border-dashed border-line-strong px-3.5 py-6 text-center text-[12.5px] text-ink-muted">
            No logo yet — the site falls back to the template&rsquo;s built-in mark.
          </p>
        )}

        <div>
          <label htmlFor="logo" className="mb-1.5 block text-[12px] text-ink-muted">
            Logo file
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            required
            // A hint to the file picker only — the action re-checks the type,
            // because `accept` constrains a dialog and not a POST.
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
              setFeedback(null);
            }}
            className="w-full text-[13px] text-ink file:mr-3 file:rounded-[6px] file:border file:border-line-strong file:bg-tint file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink"
          />
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
            PNG, JPEG, WebP or SVG, up to 5MB. Empty space around the mark is trimmed automatically,
            so a logo with wide margins and one without end up the same size on the page. An SVG is
            converted to an image on upload.
          </p>
        </div>

        {iconBaseUrl ? (
          <div className="flex items-center gap-3 rounded-[8px] bg-tint px-3.5 py-3">
            <span className="text-[12px] text-ink-muted">Favicon</span>
            {[32, 180].map((size) => (
              <Image
                key={size}
                src={`${iconBaseUrl}-${size}.png`}
                alt=""
                width={size === 32 ? 16 : 32}
                height={size === 32 ? 16 : 32}
                unoptimized
                className="rounded-[3px] border border-line"
              />
            ))}
            <span className="text-[11.5px] text-ink-muted">32, 180, 192 and 512px generated</span>
          </div>
        ) : null}

        {ogImageUrl ? (
          <div className="rounded-[8px] bg-tint px-3.5 py-3">
            <p className="mb-2 text-[12px] text-ink-muted">Share card (WhatsApp, LinkedIn)</p>
            <Image
              src={ogImageUrl}
              alt=""
              width={300}
              height={158}
              unoptimized
              className="rounded-[4px] border border-line"
            />
          </div>
        ) : null}

        <EffectNote>
          Saved immediately. The favicon may keep showing the old mark in a tab that is already
          open — browsers cache those hard; a new tab shows the new one.
        </EffectNote>

        <SaveButton pending={pending} label={pending ? "Uploading" : "Upload logo"} />
      </Panel>
    </form>
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
 * A plain `<img>`, not `next/image`: the source is either a `blob:` object URL
 * for a file that has not been uploaded yet, or a stored URL whose host depends
 * on which storage backend is active. Neither is something the image optimiser
 * can be configured for ahead of time.
 */
function LogoImage({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="max-h-12 w-auto max-w-full object-contain" />;
}
