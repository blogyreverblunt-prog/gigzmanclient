import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/platform-auth";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Sign in — Gigzman",
  robots: { index: false, follow: false },
};

/**
 * `/login/submit` redirects back here with a code rather than a message, so the
 * wording lives in one place and never travels through the query string.
 * An unrecognised code renders nothing — a hand-edited URL should not be able
 * to put arbitrary text inside the page's error banner.
 */
const ERRORS: Record<string, string> = {
  invalid: "Incorrect email or password.",
  missing: "Enter both email and password.",
};

/** Same rule as the POST handler: reject protocol-relative `//evil.com`. */
function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function PlatformLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getPlatformSession();
  const params = await searchParams;
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? (ERRORS[params.error] ?? null) : null;

  if (session) redirect(next);

  return (
    <div className="flex min-h-screen items-center justify-center bg-tint px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="eyebrow">Gigzman</p>
          <h1 className="display-md mt-2">Sign in</h1>
          <p className="mt-2 text-[13px] text-ink-muted">Team access only.</p>
        </div>

        <div className="mt-7 rounded-[12px] border border-line bg-surface p-6">
          <LoginForm next={next} error={error} />
        </div>
      </div>
    </div>
  );
}
