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

/** A well-formed bcrypt hash: `$2<variant>$<cost>$` then 53 chars of `./A-Za-z0-9`. */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * The same secret has to be written two different ways depending on where it is
 * stored, and only one of them can be right at a time — so accept both.
 *
 * dotenv expands `$VARIABLE`, and a bcrypt hash is literally `$2b$10$…`, so in
 * a `.env` file every `$` must be escaped (`\$2b\$10\$…`) or the value is
 * mangled before the app ever sees it. `@next/env` undoes that escaping — but
 * only for keys it parses out of a `.env` *file*. `.env.local` is gitignored,
 * so a real deployment has no such file: Vercel injects env vars straight into
 * `process.env` and nothing unescapes them. Paste the escaped form there and
 * bcrypt reads the backslashes as part of the salt and returns false — the
 * same "Incorrect email or password" as a genuinely wrong password, from a
 * hash that verifies fine on the developer's machine.
 *
 * Normalising here makes the paste safe in either direction. A backslash is not
 * valid anywhere in a bcrypt hash, so removing one before a `$` can never
 * corrupt a real one.
 */
function normalizePasswordHash(raw: string): string {
  // split/join rather than a regex: the pattern is a literal, and `\$` inside
  // one more escaping layer is exactly the confusion this function exists for.
  const hash = raw.trim().split("\\$").join("$");

  // The failure this guards is silent by construction — a malformed hash and a
  // wrong password produce byte-identical responses, which is why the original
  // bug survived a production deploy. Say which one it is in the log.
  if (!BCRYPT_HASH.test(hash)) {
    console.warn(
      "[platform-auth] PLATFORM_ADMIN_PASSWORD_HASH is not a well-formed bcrypt hash " +
        `(got ${hash.length} chars, expected 60). Every sign-in will fail with ` +
        '"Incorrect email or password" regardless of the password entered.',
    );
  }
  return hash;
}

function credentials(): { email: string; passwordHash: string } {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const passwordHash = process.env.PLATFORM_ADMIN_PASSWORD_HASH;
  if (!email || !passwordHash) {
    throw new Error("PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD_HASH are not set.");
  }
  return { email, passwordHash: normalizePasswordHash(passwordHash) };
}

export async function verifyPlatformCredentials(email: string, password: string): Promise<boolean> {
  const { email: expectedEmail, passwordHash } = credentials();
  if (email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) return false;
  return bcrypt.compare(password, passwordHash);
}

export interface PlatformSessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
}

/**
 * The session cookie as plain data, rather than written straight to the cookie
 * store.
 *
 * Sign-in is a Route Handler that answers 303 (see `app/login/submit/route.ts`),
 * and returning the cookie lets that handler attach it to the very response it
 * redirects with. `cookies().set()` does work inside a Route Handler, but the
 * Set-Cookie then rides on a response the handler never names — and if it fails
 * to attach, the symptom is a redirect that lands straight back on /login with
 * no error, which looks like rejected credentials rather than a lost cookie.
 * Explicit is worth the extra type here.
 */
export async function createPlatformSessionCookie(email: string): Promise<PlatformSessionCookie> {
  const value = await new SignJWT({ role: "platform-admin", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  return {
    name: COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  };
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
