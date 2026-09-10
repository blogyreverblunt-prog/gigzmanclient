"use client";

import { whatsappHref } from "@/lib/whatsapp";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

interface ShortlistFormProps {
  action: string;
  whatsapp: string | null;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
  localities: string[];
}

const INTENTS = [
  { value: "buy", label: "Buy" },
  { value: "invest", label: "Invest" },
  { value: "sell", label: "Sell" },
] as const;

const BUDGETS = [
  { label: "Select Budget", value: "" },
  { label: "Under ₹1 Cr", value: "10000000" },
  { label: "₹1 Cr – ₹2 Cr", value: "20000000" },
  { label: "₹2 Cr – ₹5 Cr", value: "50000000" },
  { label: "Above ₹5 Cr", value: "100000000" },
];

const TIMELINES = ["Select Timeline", "Immediately", "1–3 months", "3–6 months", "Just exploring"];

const FIELD =
  "w-full min-h-[44px] rounded-[6px] border border-line-strong bg-surface px-3 text-[13.5px] text-ink focus:border-navy focus:outline-none";

/**
 * Luxury Advisory's hero conversion module. Hands the visitor's stated
 * intent to the properties listing pre-filtered; the follow-up conversation
 * happens through the contact form or WhatsApp rather than collecting
 * contact details in the hero itself.
 */
export default function ShortlistForm({ action, whatsapp,
  country, localities }: ShortlistFormProps) {
  const router = useRouter();
  const [intent, setIntent] = useState<string>("buy");
  const [budget, setBudget] = useState("");
  const [corridor, setCorridor] = useState("");
  const [timeline, setTimeline] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (intent === "sell") {
      router.push(`${action.replace("/properties", "/contact")}?intent=sell`);
      return;
    }
    if (budget) params.set("maxPrice", budget);
    if (corridor) params.set("locality", corridor);
    router.push(`${action}${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-[10px] border border-line bg-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_24px_60px_-28px_rgba(27,36,54,0.4)] sm:p-6"
    >
      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-ink-muted">I want to</legend>
        <div className="grid grid-cols-3 gap-2">
          {INTENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setIntent(option.value)}
              aria-pressed={intent === option.value}
              className={`min-h-[42px] rounded-[6px] border text-[13px] font-medium transition-colors ${
                intent === option.value
                  ? "border-navy bg-navy text-white"
                  : "border-line-strong bg-surface text-ink-muted hover:border-navy"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sf-budget" className="mb-1.5 block text-[12.5px] text-ink-muted">
            Budget
          </label>
          <select id="sf-budget" value={budget} onChange={(e) => setBudget(e.target.value)} className={FIELD}>
            {BUDGETS.map((b) => (
              <option key={b.label} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sf-corridor" className="mb-1.5 block text-[12.5px] text-ink-muted">
            Preferred Corridor
          </label>
          <select id="sf-corridor" value={corridor} onChange={(e) => setCorridor(e.target.value)} className={FIELD}>
            <option value="">Select Corridor</option>
            {localities.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="sf-timeline" className="mb-1.5 block text-[12.5px] text-ink-muted">
          Timeline
        </label>
        <select id="sf-timeline" value={timeline} onChange={(e) => setTimeline(e.target.value)} className={FIELD}>
          {TIMELINES.map((t, i) => (
            <option key={t} value={i === 0 ? "" : t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="mt-4 min-h-[46px] w-full rounded-[6px] bg-navy px-5 text-[14px] font-medium text-white hover:bg-navy-soft"
      >
        Build My Shortlist
      </button>

      {whatsappHref(whatsapp, country) ? (
        <a
          href={whatsappHref(whatsapp, country)!}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[6px] border border-line-strong text-[13.5px] font-medium text-navy hover:border-navy"
        >
          <MessageCircle className="h-4 w-4 text-accent" aria-hidden="true" />
          Chat on WhatsApp
        </a>
      ) : null}

      <p className="mt-3 text-center text-[11.5px] text-ink-subtle">
        Free. No obligation. 100% confidential.
      </p>
    </form>
  );
}
