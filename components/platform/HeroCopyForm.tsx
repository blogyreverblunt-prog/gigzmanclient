"use client";

import { useState, useTransition } from "react";
import { Award, IndianRupee, Ruler, ShieldCheck, Signpost, Trees, Users } from "lucide-react";
import {
  EffectNote,
  FIELD,
  FeedbackBanner,
  Panel,
  Row,
  SaveButton,
  type Feedback,
} from "@/components/platform/form-primitives";
import { updateClientHeroCopy } from "@/lib/actions/platform-actions";
import {
  HERO_STAT_COUNT,
  STAT_ICONS,
  type HeroCopyValue,
  type StatIcon,
  type StatKind,
} from "@/lib/premium-v2/hero-copy-types";

const ICON_COMPONENTS: Record<StatIcon, React.ComponentType<{ className?: string }>> = {
  Award,
  Users,
  Signpost,
  ShieldCheck,
  Trees,
  Ruler,
  IndianRupee,
};

/**
 * What each tile can show. Only `claim` takes a typed value — the other four
 * are counted from the client's own inventory when the page renders, which is
 * why the value box disappears when one is selected rather than being disabled
 * and ignored.
 */
const KIND_OPTIONS: { kind: StatKind; label: string; help: string }[] = [
  { kind: "claim", label: "A figure you state", help: "You type it. Must be true — it is a claim on a real business's site." },
  { kind: "listings", label: "Number of listings", help: "Counted from this client's properties." },
  { kind: "corridors", label: "Corridors covered", help: "Counted from this client's localities." },
  { kind: "medianPlot", label: "Median plot size", help: "Calculated from this client's listings." },
  { kind: "medianPrice", label: "Median asking price", help: "Calculated from this client's listings." },
];

export default function HeroCopyForm({
  clientId,
  firmName,
  initial,
  isCustomised,
}: {
  clientId: string;
  firmName: string;
  initial: HeroCopyValue;
  isCustomised: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [copy, setCopy] = useState<HeroCopyValue>(initial);

  const setStat = (index: number, patch: Partial<HeroCopyValue["stats"][number]>) =>
    setCopy((current) => ({
      ...current,
      stats: current.stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat)),
    }));

  // `{firm}` is substituted at render time, so the preview has to do the same
  // or it shows the operator something the visitor never sees.
  const resolvedBlurb = copy.blurb.replace("{firm}", firmName);

  return (
    <form
      action={(formData) =>
        startTransition(async () => setFeedback(await updateClientHeroCopy(formData)))
      }
    >
      <input type="hidden" name="clientId" value={clientId} />
      <Panel
        title="Homepage hero"
        note={
          isCustomised
            ? "This client has its own hero copy."
            : "Using the template default. Editing anything here makes it this client's own."
        }
      >
        <FeedbackBanner feedback={feedback} />

        {/*
          A representation of the hero, not the real HeroV2 component. HeroV2 is
          a Client Component wired to the enquiry action and the property search,
          and mounting a live one inside an editor would put a working lead form
          on the operator's screen. This shows the same copy in the same order,
          which is what is being edited.
        */}
        <div className="rounded-[8px] border border-line bg-navy px-5 py-6 text-white">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">
            {copy.eyebrow || "—"}
          </p>
          <p className="mt-2 font-serif text-[26px] leading-tight">
            {copy.headline[0] || "—"}
            <br />
            <span className="text-white/80">{copy.headline[1]}</span>
          </p>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-white/80">{resolvedBlurb}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {copy.stats.map((stat, index) => {
              const Icon = ICON_COMPONENTS[stat.icon];
              return (
                <div key={index} className="rounded-[6px] bg-white/10 px-3 py-2.5">
                  {Icon ? <Icon className="h-4 w-4 text-white/70" /> : null}
                  <p className="mt-1 text-[15px] font-semibold">
                    {stat.kind === "claim" ? stat.value || "—" : <span className="text-white/60">counted</span>}
                  </p>
                  <p className="text-[11px] leading-tight text-white/70">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <Row>
          <div>
            <label htmlFor="eyebrow" className="mb-1.5 block text-[12px] text-ink-muted">
              Small line above the headline
            </label>
            <input
              id="eyebrow"
              name="eyebrow"
              value={copy.eyebrow}
              onChange={(e) => setCopy({ ...copy, eyebrow: e.target.value })}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="searchPlaceholder" className="mb-1.5 block text-[12px] text-ink-muted">
              Enquiry box placeholder
            </label>
            <input
              id="searchPlaceholder"
              name="searchPlaceholder"
              value={copy.searchPlaceholder}
              onChange={(e) => setCopy({ ...copy, searchPlaceholder: e.target.value })}
              className={FIELD}
            />
          </div>
        </Row>

        <Row>
          <div>
            <label htmlFor="headline0" className="mb-1.5 block text-[12px] text-ink-muted">
              Headline, first line
            </label>
            <input
              id="headline0"
              name="headline0"
              required
              value={copy.headline[0]}
              onChange={(e) => setCopy({ ...copy, headline: [e.target.value, copy.headline[1]] })}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="headline1" className="mb-1.5 block text-[12px] text-ink-muted">
              Headline, second line
            </label>
            <input
              id="headline1"
              name="headline1"
              value={copy.headline[1]}
              onChange={(e) => setCopy({ ...copy, headline: [copy.headline[0], e.target.value] })}
              className={FIELD}
            />
          </div>
        </Row>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="blurb" className="text-[12px] text-ink-muted">
              Paragraph
            </label>
            <button
              type="button"
              onClick={() => setCopy({ ...copy, blurb: `${copy.blurb}{firm}` })}
              className="text-[11.5px] font-medium text-navy hover:underline"
            >
              Insert {"{firm}"}
            </button>
          </div>
          <textarea
            id="blurb"
            name="blurb"
            rows={3}
            required
            value={copy.blurb}
            onChange={(e) => setCopy({ ...copy, blurb: e.target.value })}
            className={`${FIELD} py-2.5`}
          />
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
            <code className="font-mono">{"{firm}"}</code> is replaced with the business name, so it
            stays right if the name changes. The preview above shows it filled in.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-[12px] font-medium text-ink">The four tiles</p>
          {copy.stats.slice(0, HERO_STAT_COUNT).map((stat, index) => (
            <div key={index} className="rounded-[8px] border border-line p-3.5">
              <p className="mb-2 text-[11.5px] uppercase tracking-wide text-ink-muted">
                Tile {index + 1}
              </p>
              <input type="hidden" name={`stats.${index}.kind`} value={stat.kind} />
              <input type="hidden" name={`stats.${index}.icon`} value={stat.icon} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] text-ink-muted">Shows</label>
                  <select
                    value={stat.kind}
                    onChange={(e) => setStat(index, { kind: e.target.value as StatKind })}
                    className={FIELD}
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option key={option.kind} value={option.kind}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                    {KIND_OPTIONS.find((o) => o.kind === stat.kind)?.help}
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] text-ink-muted">Label</label>
                  <input
                    name={`stats.${index}.label`}
                    value={stat.label}
                    onChange={(e) => setStat(index, { label: e.target.value })}
                    className={FIELD}
                  />
                </div>
              </div>

              {stat.kind === "claim" ? (
                <div className="mt-3">
                  <label className="mb-1.5 block text-[12px] text-ink-muted">Figure</label>
                  <input
                    name={`stats.${index}.value`}
                    value={stat.value ?? ""}
                    onChange={(e) => setStat(index, { value: e.target.value })}
                    placeholder="12+"
                    className={`${FIELD} max-w-[10rem]`}
                  />
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                    Confirm this with the client before publishing it — it is a factual claim on
                    their website.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
                  The number is counted from this client&rsquo;s own listings when the page loads,
                  so it cannot disagree with what the site is showing.
                </p>
              )}

              <div className="mt-3">
                <p className="mb-1.5 text-[12px] text-ink-muted">Icon</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAT_ICONS.map((name) => {
                    const Icon = ICON_COMPONENTS[name];
                    const active = stat.icon === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-label={name}
                        aria-pressed={active}
                        onClick={() => setStat(index, { icon: name })}
                        className={`rounded-[6px] border p-2 ${
                          active ? "border-navy bg-navy text-white" : "border-line-strong text-ink-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <EffectNote>Live within a few seconds of saving.</EffectNote>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton pending={pending} label={pending ? "Saving" : "Save hero copy"} />
          {isCustomised ? (
            <button
              type="submit"
              name="reset"
              value="on"
              className="text-[12.5px] text-ink-muted hover:text-navy hover:underline"
            >
              Reset to the template default
            </button>
          ) : null}
        </div>
      </Panel>
    </form>
  );
}
