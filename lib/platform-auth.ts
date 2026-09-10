import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

/**
 * Gates the internal platform dashboard: `/` (the client list) and
 * `/clients/**` (the per-client edit screens). There is no `/admin` section and
 * no public template-library page — `/` itself is the single gated dashboard,
 * as AGENTS.md describes.
 *
 * A single shared operator login from environment variables, so it deliberately
 * does not touch the `users`/`clients` tables `lib/auth.ts` uses for per-tenant
 * dashboards; the two systems share nothing but the signing secret. Individual
 * client sites (`/{vertical}/{template}/{slug}/...`) are never gated by this.
 *
 * `requirePlatformAdmin` redirects, which is right for a page and a trap in a
 * Server Action: `redirect()` throws, and an action whose catch returns the
 * error as a message will report "NEXT_REDIRECT" to the operator. Platform
 * actions call `unstable_rethrow(error)` first in their catch for that reason.
 */

const COOKIE_NAME = "gz_platform_session";
// Short-lived on purpose — this is the "auto logout" requirement: the
// session self-expires rather than staying valid indefinitely.
const MAX_AGE_SECONDS = 60 * 60;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET is not set, or is too short to sign sessions with.");
  }
  return new TextEncoder().encode(value);
}

function credentials(): { email: string; passwordHash: string } {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const passwordHash = process.env.PLATFORM_ADMIN_PASSWORD_HASH;
  if (!email || !passwordHash) {
    throw new Error("PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD_HASH are not set.");
  }
  return { email, passwordHash };
}

export async function verifyPlatformCredentials(email: string, password: string): Promise<boolean> {
  const { email: expectedEmail, passwordHash } = credentials();
  if (email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) return false;
  return bcrypt.compare(password, passwordHash);
}

export async function createPlatformSession(email: string) {
  const token = await new SignJWT({ role: "platform-admin", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroyPlatformSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const getPlatformSession = cache(async (): Promise<{ email: string } | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "platform-admin" || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
});

/** Redirects to the login page, preserving the originally requested path. */
export async function requirePlatformAdmin(nextPath: string): Promise<{ email: string }> {
  const session = await getPlatformSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}
