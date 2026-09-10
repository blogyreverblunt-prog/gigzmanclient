"use client";

import { whatsappHref } from "@/lib/whatsapp";
import { useState } from "react";
import Image from "next/image";
import { analytics } from "@/lib/analytics";
import { GpContainer, GpSection, GpEyebrow } from "./gp-primitives";
import WhatsAppIconV2 from "./WhatsAppIconV2";

const INTENTS = ["Buy", "Sell", "Rent", "Invest"] as const;

const TRUST_METRICS = [
  { value: "100%", label: "RERA-aware review" },
  { value: "1 advisor", label: "Single point of contact" },
  { value: "5 options", label: "Focused shortlist" },
  { value: "0 pressure", label: "Decision-first process" },
];

const FIELD =
  "w-full min-h-[48px] rounded-[var(--gp-radius-sm)] border border-[color:var(--gp-border)] bg-white px-3.5 text-[13.5px] text-[color:var(--gp-ink)] focus:border-[color:var(--gp-forest-900)] focus:outline-none";

export default function ShortlistCtaV2({
  whatsapp,
  country,
  firmName,
}: {
  whatsapp?: string | null;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
  firmName: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState<(typeof INTENTS)[number]>("Buy");

  // Resolved once, and it is what decides whether the button is offered at
  // all. Previously `submit` returned early when there was no number, so the
  // button rendered, accepted a click and did nothing whatsoever — no message,
  // no error, nothing. A visitor cannot tell that from a slow network, and the
  // enquiry is simply lost. A control that cannot do its job must say so
  // rather than pretend.
  const waLink = whatsappHref(
    whatsapp,
    country,
    `Hi ${firmName}, I'm ${name || "interested"} and I want to ${intent.toLowerCase()}. My number is ${phone || "—"}.`,
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    analytics.shortlistRequest(intent.toLowerCase());
    if (!waLink) return;
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  return (
    <GpSection
      tone="forest"
      background={
        <>
          <Image
            src="/verticals/realestate/templates/premium-v2/images/personalised-recommendation.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: "var(--gp-gradient-dark-section)", opacity: 0.88 }}
          />
        </>
      }
    >
      <div className="relative">
        <GpContainer>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <GpEyebrow>Assisted, Never Pressured</GpEyebrow>
              <h2 className="gp-section-title font-display mt-3 max-w-lg text-white">
                Tell us what matters. We&rsquo;ll curate what fits.
              </h2>
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/70">
                A local specialist compares the project, locality, price history and documents —
                then gives you a shortlist you can act on.
              </p>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-4 sm:gap-x-8">
                {TRUST_METRICS.map((metric, index) => (
                  <div
                    key={metric.label}
                    className={`pl-0 ${index > 0 ? "sm:border-l sm:border-white/15 sm:pl-6 md:pl-8" : ""}`}
                  >
                    <p className="font-sans text-[26px] font-semibold leading-none text-[color:var(--gp-gold-300)]">
                      {metric.value}
                    </p>
                    <p className="mt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-white/70">
                      {metric.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={submit}
              className="rounded-[var(--gp-radius-lg)] p-6 sm:p-7"
              style={{ background: "var(--gp-gradient-glass)" }}
            >
              <div>
                <label htmlFor="gp-shortlist-name" className="mb-1.5 block text-[12.5px] text-[color:var(--gp-body)]">
                  Name
                </label>
                <input
                  id="gp-shortlist-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className={FIELD}
                />
              </div>

              <div className="mt-3">
                <label htmlFor="gp-shortlist-phone" className="mb-1.5 block text-[12.5px] text-[color:var(--gp-body)]">
                  Mobile number
                </label>
                <input
                  id="gp-shortlist-phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Your mobile number"
                  className={FIELD}
                />
              </div>

              <div className="mt-3">
                <label htmlFor="gp-shortlist-intent" className="mb-1.5 block text-[12.5px] text-[color:var(--gp-body)]">
                  I want to
                </label>
                <select
                  id="gp-shortlist-intent"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value as (typeof INTENTS)[number])}
                  className={FIELD}
                >
                  {INTENTS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={!waLink}
                className="mt-5 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-5 text-[13.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <WhatsAppIconV2 className="h-4 w-4" />
                WhatsApp Now
              </button>

              <p className="mt-3 text-center text-[11.5px] text-[color:var(--gp-muted)]">
                {waLink
                  ? "Free. No obligation. 100% confidential."
                  : "WhatsApp enquiries are not set up for this office yet — use the phone number above."}
              </p>
            </form>
          </div>
        </GpContainer>
      </div>
    </GpSection>
  );
}
