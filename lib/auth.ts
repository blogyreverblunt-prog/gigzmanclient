import { cache } from "react";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, clients } from "@/lib/db/schema";

const COOKIE_NAME = "gz_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET is not set, or is too short to sign sessions with.");
  }
  return new TextEncoder().encode(value);
}

export interface SessionUser {
  id: string;
  clientId: string;
  email: string;
  name: string | null;
  role: "admin" | "editor";
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub: user.id,
    clientId: user.clientId,
    email: user.email,
    name: user.name,
    role: user.role,
  })
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

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Resolves the signed-in user and confirms they belong to the tenant being
 * requested — a valid session for one client must not grant access to another.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    return null;
  }

  const userId = payload.sub as string | undefined;
  if (!userId) return null;

  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isActive, true)))
    .limit(1);
  if (!row) return null;

  const h = await headers();
  const tenantSlug = h.get("x-tenant");
  if (tenantSlug) {
    // `isActive` in the predicate, not just `slug`: a deactivated tenant is off
    // the air for writes as well as renders, and this is the one query every
    // dashboard Server Action resolves its user through. Without it a live
    // `gz_session` issued before deactivation still passed `requireUser` /
    // `requireAdmin`, so nothing rendered but everything still saved. Resolving
    // to no user is what makes those throw. See lib/tenant.ts's `isActive`
    // comment for the full list of paths carrying this predicate.
    const [tenant] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.slug, tenantSlug), eq(clients.isActive, true)))
      .limit(1);
    if (!tenant || tenant.id !== row.clientId) return null;
  }

  return {
    id: row.id,
    clientId: row.clientId,
    email: row.email,
    name: row.name,
    role: row.role,
  };
});

/**
 * Server Actions are directly reachable POST endpoints, so every mutating action
 * calls this rather than relying on the dashboard layout having rendered.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("This action requires an administrator account");
  }
  return user;
}
