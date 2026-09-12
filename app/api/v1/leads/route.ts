import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { queries } from "@/lib/db/schema";
import { bearerToken, clientIdForApiKey } from "@/lib/api-keys";
import { createLead, type LeadInput } from "@/lib/leads/create-lead";

/**
 * Lead ingest for client sites hosted outside this deployment.
 *
 * The tenants served from here write through `submitQuery`, a Server Action
 * that reads the tenant from the `x-tenant` header `proxy.ts` sets. A client
 * site on its own Vercel project has no proxy, sets no header, and cannot
 * invoke a Server Action at all — so it needs an HTTP door. The API key is what
 * replaces that header as the tenant claim.
 *
 * **`clientId` is resolved from the key and never read from the body.** This is
 * the invariant the whole shared-database design rests on: if a client
 * identifier in the payload could select the tenant, any key holder could write
 * into every other client's data. A `clientId` field in the request is ignored,
 * not honoured and not rejected — there is nothing to reject, because nothing
 * reads it.
 *
 * No CORS headers, deliberately. This is meant to be called from the client
 * site's *server*, where the key stays secret; a key shipped to a browser is
 * public the moment the page loads. Leaving preflight to fail is what keeps
 * that mistake loud instead of silent.
 *
 * Sits under `/api`, which `proxy.ts`'s matcher already excludes from tenant
 * rewriting, so it needs no routing change.
 */

export const dynamic = "force-dynamic";

/** Per-client ceiling. Generous for a contact form, ruinous for a spam run. */
const MAX_LEADS_PER_MINUTE = 30;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return json({ ok: false, error: "missing_credentials" }, 401);
  }

  // One generic answer for malformed, unknown, revoked and deactivated, so a
  // probe cannot use the response to discover which prefixes exist.
  const clientId = await clientIdForApiKey(token);
  if (!clientId) {
    return json({ ok: false, error: "invalid_credentials" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const recent = await leadsInLastMinute(clientId);
  if (recent >= MAX_LEADS_PER_MINUTE) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  const payload = body as Record<string, unknown>;
  const input: LeadInput = {
    name: str(payload.name),
    phone: str(payload.phone),
    email: str(payload.email),
    message: str(payload.message),
    note: str(payload.note),
    clientType: str(payload.clientType),
    serviceSlug: str(payload.service ?? payload.serviceSlug),
    preferredContact: str(payload.preferredContact),
    consent: payload.consent === true,
    marketingConsent: payload.marketingConsent === true,
    landingPage: str(payload.landingPage),
    calculatorId: str(payload.calculatorId),
    honeypot: str(payload.company),
    leadSource: str(payload.leadSource) || "api",
    formName: str(payload.formName) || "api",
    // Header first: idempotency belongs to the transport, and a retry library
    // replays headers without the caller having to thread the key through its
    // own payload. The body field is accepted as a fallback for clients that
    // cannot set custom headers.
    externalId: (request.headers.get("idempotency-key") ?? str(payload.idempotencyKey)).slice(0, 64),
  };

  const result = await createLead(clientId, input);

  if (!result.ok) {
    return json({ ok: false, error: "validation_failed", errors: result.errors }, 422);
  }

  // 200 for a replayed request, 201 for a lead that was actually written — so a
  // caller retrying after a timeout can tell whether its first attempt landed.
  return json(
    { ok: true, reference: result.reference, duplicate: result.duplicate ?? false },
    result.duplicate ? 200 : 201,
  );
}

async function leadsInLastMinute(clientId: string): Promise<number> {
  // Counts the client's own rows rather than keeping a counter: it needs no new
  // table and no external store, and unlike an in-memory tally it is correct
  // across serverless instances, which each have their own memory.
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(queries)
    .where(
      and(
        eq(queries.clientId, clientId),
        gt(queries.createdAt, new Date(Date.now() - 60_000)),
      ),
    );
  return row?.n ?? 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Anything but POST, including a browser's CORS preflight. */
export async function GET() {
  return json({ ok: false, error: "method_not_allowed" }, 405);
}
