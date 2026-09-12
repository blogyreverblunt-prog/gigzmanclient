"use server";

import { redirect } from "next/navigation";
import { destroyPlatformSession } from "@/lib/platform-auth";

/**
 * Sign-in is no longer here — it is a Route Handler at `app/login/submit/route.ts`,
 * because a Server Action id is build-scoped and a tab left open across a deploy
 * loses it mid-sign-in.
 *
 * Sign-out stays an action on purpose. It has the same skew exposure, but the
 * cost of hitting it is a reload and a second click rather than re-entering
 * credentials, it is idempotent, and the session expires on its own within the
 * hour regardless.
 */
export async function logoutPlatformAdmin() {
  await destroyPlatformSession();
  redirect("/login");
}
