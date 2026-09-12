import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyPlatformCredentials, createPlatformSessionCookie } from "@/lib/platform-auth";

/**
 * The platform sign-in POST target.
 *
 * A Route Handler rather than a Server Action, deliberately. A Server Action is
 * addressed by a build-time hash of the module it lives in, so a tab loaded
 * from the previous deployment posts an id the new deployment has never heard
 * of: Next answers 404 and React throws `UnrecognizedActionError`, replacing
 * the form with "This page couldn't load".
 *
 * Every other screen shrugs that off — the user reloads and carries on. Sign-in
 * is the one screen where it lands *after* the credentials have been typed, and
 * it catches anyone whose tab was open across a deploy, which on this project
 * is the operator watching the deploy they just triggered. A Route Handler's
 * URL is `/login/submit` in every build, so the form keeps working across
 * deployments, and sign-in also works with JavaScript disabled.
 *
 * `proxy.ts` already lets this through: it exempts the whole `login` segment
 * from tenant rewriting, one segment above this route.
 */

/**
 * Only same-origin absolute paths may be redirected to after sign-in.
 *
 * `startsWith("/")` alone is not enough: `//evil.com` passes it and is a
 * protocol-relative URL, which the browser resolves to another origin. That
 * would turn the login form into an open redirect — a phishing primitive, since
 * the hop happens on an authenticated response.
 */
function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));

  /**
   * 303, not Next's default 307. A 307 preserves the method, so the browser
   * would re-POST to the target and the dashboard would answer 405. 303 is the
   * status that means "your POST is done, now GET this instead".
   */
  const backToLogin = (error: string) =>
    NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}&error=${error}`, request.url),
      { status: 303 },
    );

  if (!email || !password) return backToLogin("missing");
  if (!(await verifyPlatformCredentials(email, password))) return backToLogin("invalid");

  const cookie = await createPlatformSessionCookie(email);
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
