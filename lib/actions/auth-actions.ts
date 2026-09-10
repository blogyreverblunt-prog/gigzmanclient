"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, clients } from "@/lib/db/schema";
import { createSession, destroySession } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  if (!email || !password) {
    return { error: "Enter your email address and password." };
  }

  const h = await headers();
  const tenantSlug = h.get("x-tenant");
  if (!tenantSlug) return { error: "Sign-in is unavailable on this address." };

  // `isActive` in the predicate: a deactivated tenant's staff must not be able
  // to obtain a NEW session either, or deactivation would only expire the
  // sessions that already existed. Same message as an unknown tenant, so the
  // form cannot be used to probe which clients exist. See lib/tenant.ts's
  // `isActive` comment for the full list of paths carrying this predicate.
  const [tenant] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.slug, tenantSlug), eq(clients.isActive, true)))
    .limit(1);
  if (!tenant) return { error: "Sign-in is unavailable on this address." };

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.clientId, tenant.id), eq(users.isActive, true)))
    .limit(1);

  // The same message is returned whether the account is missing or the password
  // is wrong, so the form cannot be used to discover valid addresses.
  const failure = { error: "Those sign-in details were not recognised." };
  if (!user) {
    await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return failure;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return failure;

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await createSession({
    id: user.id,
    clientId: user.clientId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect(redirectTo);
}

export async function logout(formData: FormData) {
  await destroySession();
  redirect(String(formData.get("redirectTo") ?? "/"));
}
