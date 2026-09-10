"use client";

import { AlertCircle, Check, Clock, Loader2 } from "lucide-react";

/**
 * Shared controls for the three platform edit panels.
 *
 * Deliberately a copy of the house style in `components/dashboard/SettingsForm.tsx`
 * rather than an import of it: those primitives are file-local and unexported,
 * and that file belongs to the TENANT dashboard, which authenticates differently
 * and is scoped to one client. Exporting them from there to share with a
 * platform screen would tie the two surfaces together for the sake of a text
 * input.
 *
 * Nothing here may import lib/db, lib/tenant, lib/content, lib/platform/clients
 * or a value from lib/features: a Client Component cannot do a lookup. Every
 * resolved value these render arrives as a serialisable prop from the Server
 * Component.
 */

export const FIELD =
  "w-full min-h-[40px] rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-ink focus:border-navy focus:outline-none";

export interface Feedback {
  ok: boolean;
  message?: string;
}

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-line bg-surface p-5">
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {note ? <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{note}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function Row({ children, three }: { children: React.ReactNode; three?: boolean }) {
  return (
    <div className={`grid gap-3 ${three ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{children}</div>
  );
}

export function Input({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  help,
}: {
  name: string;
  label: string;
  /**
   * The stored value, or "". Never a guess and never an example: an empty field
   * renders nothing on the public site, an invented one ships a lie on a real
   * business's website. Hints belong in `help`, outside the value.
   */
  defaultValue: string;
  type?: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-[12px] text-ink-muted">
        {label} {required ? <span className="text-accent">*</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete="off"
        className={FIELD}
      />
      {help ? <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{help}</p> : null}
    </div>
  );
}

export function TextArea({
  name,
  label,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  defaultValue: string;
  rows: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-[12px] text-ink-muted">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className={`${FIELD} py-2.5`}
      />
    </div>
  );
}

export function Toggle({
  name,
  label,
  checked,
  onChange,
  note,
  risk,
  disabled,
  id,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  note?: string;
  /** Rendered in the warning colour: a regulatory, availability or truthfulness constraint. */
  risk?: string;
  disabled?: boolean;
  id?: string;
}) {
  const controlId = id ?? name;
  return (
    <label
      htmlFor={controlId}
      className={`flex items-start gap-3 rounded-[8px] border border-line p-3.5 ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <input
        id={controlId}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f2744]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {note ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">{note}</span>
        ) : null}
        {risk ? (
          <span className="mt-1 block text-[12px] leading-relaxed text-status-warn">{risk}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * When a change takes effect. Required on every panel, and it must never say
 * "live" about something that is not: a "Saved." message that is true of the
 * database and false of the website is the exact defect this increment exists to
 * stop repeating.
 */
export function EffectNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-muted">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-[8px] px-3.5 py-2.5 text-[13px] ${
        feedback.ok
          ? "bg-status-success-soft text-status-success"
          : "bg-status-danger-soft text-status-danger"
      }`}
    >
      {feedback.ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {feedback.message}
    </p>
  );
}

export function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-[8px] bg-navy px-5 text-[14px] font-medium text-white hover:bg-navy-soft disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}
