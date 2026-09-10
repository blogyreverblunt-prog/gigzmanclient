"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Plus, Trash2 } from "lucide-react";
import {
  saveTeamMember,
  deleteTeamMember,
  uploadTeamPhoto,
  type ActionResult,
} from "@/lib/actions/dashboard-actions";

interface Member {
  id: string;
  name: string;
  designation: string | null;
  qualifications: string | null;
  membershipNumber: string | null;
  bio: string | null;
  photoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

const FIELD =
  "w-full min-h-[40px] rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-ink focus:border-navy focus:outline-none";

/**
 * Team members, editable at last.
 *
 * These rows existed since the first schema but could only be seeded from YAML,
 * so a firm that hired someone had to ask a developer. The public section is
 * still gated by the `teamEnabled` setting, which this screen deliberately does
 * not touch — hiding the section and having no people in it are different
 * states and conflating them would surprise whoever set the toggle.
 */
export default function TeamManager({
  members,
  membershipLabel,
}: {
  members: Member[];
  membershipLabel: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-4">
      <Feedback result={feedback} />

      {members.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-surface p-6 text-[13px] text-ink-muted">
          Nobody added yet. The team section on the public site stays hidden until there is at
          least one person.
        </p>
      ) : null}

      {members.map((member) => (
        <div key={member.id} className="rounded-[10px] border border-line bg-surface p-5">
          {editing === member.id ? (
            <MemberForm
              member={member}
              membershipLabel={membershipLabel}
              onDone={(result) => {
                setFeedback(result);
                if (result.ok) setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {member.name}
                  {member.isActive ? null : (
                    <span className="ml-2 text-[11.5px] font-normal text-ink-muted">Hidden</span>
                  )}
                </p>
                <p className="text-[12.5px] text-ink-muted">
                  {[member.designation, member.qualifications].filter(Boolean).join(" · ") || "—"}
                </p>
                {member.membershipNumber ? (
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {membershipLabel} {member.membershipNumber}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(member.id)}
                  className="min-h-[36px] rounded-[8px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-muted hover:border-navy hover:text-navy"
                >
                  Edit
                </button>
                <DeleteButton id={member.id} name={member.name} onDone={setFeedback} />
              </div>
            </div>
          )}
        </div>
      ))}

      {editing === "new" ? (
        <div className="rounded-[10px] border border-line bg-surface p-5">
          <MemberForm
            membershipLabel={membershipLabel}
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
          Add someone
        </button>
      )}
    </div>
  );
}

function MemberForm({
  member,
  membershipLabel,
  onDone,
  onCancel,
}: {
  member?: Member;
  membershipLabel: string;
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(async () => onDone(await saveTeamMember(formData)))}
      className="space-y-3"
    >
      {member ? <input type="hidden" name="id" value={member.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label="Name" defaultValue={member?.name ?? ""} required />
        <Field name="designation" label="Role" defaultValue={member?.designation ?? ""} />
        <Field
          name="qualifications"
          label="Qualifications"
          defaultValue={member?.qualifications ?? ""}
        />
        <Field
          name="membershipNumber"
          label={membershipLabel}
          defaultValue={member?.membershipNumber ?? ""}
          help="Leave blank unless you have the number to hand. It is a regulated claim — an empty field shows nothing, a wrong one is worse."
        />
      </div>

      <div>
        <label htmlFor="bio" className="mb-1.5 block text-[12px] text-ink-muted">
          Short biography
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={member?.bio ?? ""}
          className={`${FIELD} py-2.5`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="sortOrder"
          label="Order on the page"
          type="number"
          defaultValue={String(member?.sortOrder ?? 0)}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
          <input type="checkbox" name="isActive" defaultChecked={member?.isActive ?? true} />
          Show on the website
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-[8px] bg-navy px-5 text-[13px] font-medium text-white hover:bg-navy-soft disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {member ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12.5px] text-ink-muted hover:text-navy"
        >
          Cancel
        </button>
      </div>

      {/*
        A separate form, submitted separately: the photo is a multipart upload
        and nesting it inside the details form would mean re-uploading the file
        on every text edit. Only offered once the row exists, because the upload
        action needs an id to attach it to.
      */}
      {member ? <PhotoForm member={member} onDone={onDone} /> : null}
    </form>
  );
}

function PhotoForm({ member, onDone }: { member: Member; onDone: (r: ActionResult) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-1.5 text-[12px] text-ink-muted">Photo</p>
      <div className="flex flex-wrap items-center gap-3">
        {member.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photoUrl}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tint-deep text-[11px] text-ink-muted">
            None
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const data = new FormData();
            data.set("id", member.id);
            data.set("photo", file);
            startTransition(async () => onDone(await uploadTeamPhoto(data)));
          }}
          className="text-[12.5px] text-ink file:mr-3 file:rounded-[6px] file:border file:border-line-strong file:bg-tint file:px-3 file:py-1.5 file:text-[12px] file:text-ink"
        />
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-ink-muted" /> : null}
      </div>
    </div>
  );
}

function DeleteButton({
  id,
  name,
  onDone,
}: {
  id: string;
  name: string;
  onDone: (r: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={() => setConfirming(true)}
        className="min-h-[36px] rounded-[8px] border border-line-strong px-2.5 text-ink-muted hover:border-status-danger hover:text-status-danger"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[12.5px]">
      <span className="text-ink-muted">Remove {name}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const data = new FormData();
          data.set("id", id);
          startTransition(async () => onDone(await deleteTeamMember(data)));
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
  help,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  type?: string;
  help?: string;
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
      {help ? <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{help}</p> : null}
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
