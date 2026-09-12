"use server";

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { createLead } from "@/lib/leads/create-lead";

export interface QueryFormState {
  ok: boolean;
  reference?: string;
  message?: string;
  errors?: Record<string, string>;
}

/**
 * The write path for tenant forms served by this deployment.
 *
 * Validation and insertion live in `lib/leads/create-lead.ts`, shared with the
 * HTTP endpoint that externally-hosted client sites post to. What stays here is
 * the part that is genuinely specific to this path: resolving the tenant from
 * the request headers, and reading fields out of a FormData.
 */
export async function submitQuery(
  _prev: QueryFormState,
  formData: FormData,
): Promise<QueryFormState> {
  const h = await headers();
  const tenantSlug = h.get("x-tenant");
  const tenantHost = h.get("x-tenant-host");

  // A Server Action is a POST to its own route and is directly reachable, so the
  // tenant is resolved here rather than trusted from the client payload.
  //
  // Both branches carry `isActive`: a deactivated tenant is off the air for
  // writes as well as renders, so a lead posted to a switched-off client's
  // contact action must not be written on its behalf. The form's own pages 404
  // by then, but the action stays reachable by direct POST. See lib/tenant.ts's
  // `isActive` comment for the full list of paths carrying this predicate.
  let clientId: string | null = null;
  if (tenantSlug) {
    const [row] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.slug, tenantSlug), eq(clients.isActive, true)))
      .limit(1);
    clientId = row?.id ?? null;
  } else if (tenantHost) {
    const [row] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.customDomain, tenantHost), eq(clients.isActive, true)))
      .limit(1);
    clientId = row?.id ?? null;
  }

  if (!clientId) {
    return { ok: false, message: "This form is not available right now." };
  }

  const result = await createLead(clientId, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    clientType: String(formData.get("clientType") ?? ""),
    serviceSlug: String(formData.get("service") ?? ""),
    preferredContact: String(formData.get("preferredContact") ?? ""),
    // Forms compose `message` from the structured lead fields (what they are
    // looking for, what page they were on, how to reach them). `note` is the
    // free-text box some of them also offer.
    message: String(formData.get("message") ?? ""),
    note: String(formData.get("note") ?? ""),
    consent: formData.get("consent") === "on",
    marketingConsent: formData.get("marketingConsent") === "on",
    landingPage: String(formData.get("landingPage") ?? ""),
    calculatorId: String(formData.get("calculatorId") ?? ""),
    honeypot: String(formData.get("company") ?? ""),
  });

  return { ok: result.ok, reference: result.reference, message: result.message, errors: result.errors };
}
