"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Plus, Star, Trash2 } from "lucide-react";
import {
  saveOfficeLocation,
  deleteOfficeLocation,
  type ActionResult,
} from "@/lib/actions/dashboard-actions";

interface Office {
  id: string;
  label: string;
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  phone: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

const FIELD =
  "w-full min-h-[40px] rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-ink focus:border-navy focus:outline-none";

/**
 * Additional offices, beyond the single address in Settings.
 *
 * The Settings address is the one that feeds the footer, the contact page and
 * the structured data — that is the firm's registered NAP and there is exactly
 * one of it. These rows are the extra branches, and marking one primary decides
 * which is listed first, not which is canonical.
 */
export default function OfficesManager({ offices }: { offices: Office[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-4">
      <Feedback result={feedback} />

      {offices.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-surface p-6 text-[13px] leading-relaxed text-ink-muted">
          No additional offices. The address in Settings is used everywhere; add rows here only if
          the firm has more than one location.
        </p>
      ) : null}

      {offices.map((office) => (
        <div key={office.id} className="rounded-[10px] border border-line bg-surface p-5">
          {editing === office.id ? (
            <OfficeForm
              office={office}
              onDone={(result) => {
                setFeedback(result);
                if (result.ok) setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                  {office.label}
                  {office.isPrimary ? (
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" aria-label="Primary" />
                  ) : null}
                </p>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  {[office.addressLine, office.locality, office.region, office.postalCode]
                    .filter(Boolean)
                    .join(", ") || "No address"}
                </p>
                {office.phone ? (
                  <p className="mt-0.5 text-[12.5px] text-ink-muted">{office.phone}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(office.id)}
                  className="min-h-[36px] rounded-[8px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-muted hover:border-navy hover:text-navy"
                >
                  Edit
                </button>
                <DeleteButton id={office.id} label={office.label} onDone={setFeedback} />
              </div>
            </div>
          )}
        </div>
      ))}

      {editing === "new" ? (
        <div className="rounded-[10px] border border-line bg-surface p-5">
          <OfficeForm
            onDone={(result) => {
              setFeedback(result);
              if (result.ok) setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] bg-navy px-4 text-[13px] font-medium text-white hover:bg-navy-soft"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add an office
        </button>
      )}
    </div>
  );
}

function OfficeForm({
  office,
  onDone,
  onCancel,
}: {
  office?: Office;
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(async () => onDone(await saveOfficeLocation(formData)))}
      className="space-y-3"
    >
      {office ? <input type="hidden" name="id" value={office.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="label" label="Label" defaultValue={office?.label ?? ""} required />
        <Field name="phone" label="Phone" defaultValue={office?.phone ?? ""} />
      </div>

      <Field name="addressLine" label="Address" defaultValue={office?.addressLine ?? ""} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="locality" label="Town or city" defaultValue={office?.locality ?? ""} />
        <Field name="region" label="State" defaultValue={office?.region ?? ""} />
        <Field name="postalCode" label="PIN code" defaultValue={office?.postalCode ?? ""} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="sortOrder"
          label="Order"
          type="number"
          defaultValue={String(office?.sortOrder ?? 0)}
        />
        <label className="flex items-start gap-2 self-end pb-1 text-[13px] text-ink">
          <input
            type="checkbox"
            name="isPrimary"
            defaultChecked={office?.isPrimary ?? false}
            className="mt-1"
          />
          <span>
            Main office
            <span className="block text-[11.5px] leading-relaxed text-ink-muted">
              Only one can be. Ticking this un-ticks whichever office holds it now.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-[8px] bg-navy px-5 text-[13px] font-medium text-white hover:bg-navy-soft disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {office ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12.5px] text-ink-muted hover:text-navy"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteButton({
  id,
  label,
  onDone,
}: {
  id: string;
  label: string;
  onDone: (r: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={() => setConfirming(true)}
        className="min-h-[36px] rounded-[8px] border border-line-strong px-2.5 text-ink-muted hover:border-status-danger hover:text-status-danger"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[12.5px]">
      <span className="text-ink-muted">Remove {label}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const data = new FormData();
          data.set("id", id);
          startTransition(async () => onDone(await deleteOfficeLocation(data)));
        }}
        className="font-medium text-status-danger hover:underline disabled:opacity-60"
      >
        Yes
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-ink-muted">
        No
      </button>
    </span>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-[12px] text-ink-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={FIELD}
      />
    </div>
  );
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-[8px] px-3.5 py-2.5 text-[13px] ${
        result.ok
          ? "bg-status-success-soft text-status-success"
          : "bg-status-danger-soft text-status-danger"
      }`}
    >
      {result.ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {result.message}
    </p>
  );
}
