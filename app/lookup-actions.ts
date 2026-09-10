"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { getTenantPath, templateKeyFor } from "@/lib/templates";
import { requirePlatformAdmin } from "@/lib/platform-auth";

export interface LookupState {
  error: string | null;
}

/**
 * The fast path from the dashboard into a client's site: type the ID, go
 * straight there. Not the only path any more — `app/page.tsx` lists every
 * client with a direct link — but the quick one for an operator who already
 * knows the slug. Case/whitespace-insensitive since slugs are typed by hand
 * here, unlike everywhere else they are generated from a form.
 */
export async function lookupClient(_prev: LookupState, formData: FormData): Promise<LookupState> {
  // The same preamble every other platform action carries, and this one needed
  // it most: it queries `clients` by a caller-supplied slug and answers with
  // four DISTINGUISHABLE messages — absent, deactivated, template-unresolvable,
  // and a redirect for healthy — so unauthenticated it was a slug oracle that
  // confirmed which businesses this deployment hosts and what state each is in.
  // It is a reachable POST endpoint; the gated page that renders the form proves
  // nothing about the caller.
  //
  // The distinct messages stay. They are the right operator feedback once the
  // caller is known to be the operator; it is the anonymity that was the defect,
  // not the detail. No `unstable_rethrow` guard is needed here because there is
  // no try/catch in this function — the `redirect()` at the end throws by design
  // and always has.
  await requirePlatformAdmin("/");

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!slug) return { error: "Enter a client ID." };

  const [client] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
  if (!client || !client.isActive) {
    return { error: `No active client found with ID "${slug}".` };
  }

  // A realestate client whose `template_key` is null or unrecognised has no
  // reachable URL: `getTenantPath` returns /realestate/<slug>, proxy.ts bounces
  // that to /, and the operator — who typed a valid, active client ID — lands
  // back on this form with nothing explaining why. Say what is actually wrong,
  // the same way the isActive case above does. Unreachable before CD-01 moved
  // the assignment onto the row; data-dependent now.
  if (client.vertical === "realestate" && !templateKeyFor(client)) {
    return {
      error: `Client "${slug}" has no valid template assigned, so its site has no URL. Set clients.template_key to a template the code can render.`,
    };
  }

  redirect(getTenantPath(client));
}
