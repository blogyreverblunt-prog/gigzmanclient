"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

interface LoginFormProps {
  next: string;
  /** Already resolved to a sentence by the page; null when there is nothing to show. */
  error: string | null;
}

const FIELD =
  "w-full min-h-[44px] rounded-[8px] border border-line-strong bg-surface px-3 text-[14px] text-ink focus:border-navy focus:outline-none";

/**
 * A plain HTML form posting to `/login/submit`, not a Server Action.
 *
 * The reasoning is in that route. What it costs here: the error comes back as a
 * `?error=` round trip instead of `useActionState`, and the client component
 * exists only for the pending state. That state is an enhancement — with
 * JavaScript off the form still submits and still signs in, which is the point.
 */
export default function LoginForm({ next, error }: LoginFormProps) {
  const [pending, setPending] = useState(false);

  return (
    <form
      method="post"
      action="/login/submit"
      onSubmit={() => setPending(true)}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next} />

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[8px] bg-status-danger-soft px-3.5 py-3 text-[13px] text-status-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink">
          Email address
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" className={FIELD} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[8px] bg-navy px-5 text-[14px] font-medium text-white hover:bg-navy-soft disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
