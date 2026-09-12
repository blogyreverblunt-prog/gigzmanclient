import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { queries, queryStatusHistory, services } from "@/lib/db/schema";
import { checkPhone } from "@/lib/phone";

/**
 * Validation and insertion for one lead, shared by both write paths.
 *
 * There are two doors into `queries` and they must agree on every rule:
 *
 *   - `lib/actions/submit-query.ts` — the Server Action this deployment's own
 *     tenant forms post to, tenant resolved from the `x-tenant` header.
 *   - `app/api/v1/leads/route.ts` — the HTTP endpoint a client site hosted
 *     elsewhere posts to, tenant resolved from its API key.
 *
 * They differ only in how they establish *which* client is writing, and in the
 * shape they receive the fields in (FormData vs JSON). Everything after that —
 * what a valid phone number is, that consent is mandatory, that identification
 * numbers are refused — lives here. Two copies of these rules is how one door
 * ends up accepting a lead the other would reject, and the difference would
 * surface as inconsistent data rather than as an error.
 *
 * `clientId` is a parameter, never read from caller-supplied content. The
 * caller is responsible for having established it from something the submitter
 * cannot choose.
 */

const CLIENT_TYPES = [
  "individual",
  "salaried_professional",
  "proprietorship",
  "partnership_llp",
  "company",
  "startup",
  "other",
] as const;

const CONTACT_METHODS = ["phone", "email", "whatsapp"] as const;

/** Fields the form must never accept, mirrored from the published privacy policy. */
const PROHIBITED_PATTERNS = [
  { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/, label: "PAN" },
  { pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/, label: "Aadhaar" },
];

export interface LeadInput {
  name: string;
  phone: string;
  email: string;
  /** Already composed by the caller; `note` is appended rather than kept apart. */
  message: string;
  note?: string;
  clientType?: string;
  serviceSlug?: string;
  preferredContact?: string;
  consent: boolean;
  marketingConsent?: boolean;
  landingPage?: string;
  calculatorId?: string;
  /** Hidden field humans never see. Any value means a bot filled the form. */
  honeypot?: string;
  /** Defaults derived from `calculatorId` when not given. */
  leadSource?: string;
  formName?: string;
  /** Dedupe key for API submissions. Null/absent for website forms. */
  externalId?: string;
}

export interface LeadResult {
  ok: boolean;
  reference?: string;
  message?: string;
  errors?: Record<string, string>;
  /** True when an existing lead was returned instead of a new one being written. */
  duplicate?: boolean;
}

export function leadReference(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `Q-${stamp}-${rand}`;
}

/** Shape errors without touching the database. Exported so callers can pre-check. */
export function validateLead(input: LeadInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  const message = composeMessage(input);

  if (name.length < 2) errors.name = "Enter your name.";
  if (name.length > 120) errors.name = "Name is too long.";

  if (!phone && !email) {
    errors.phone = "Provide a phone number or an email address.";
  }
  if (phone) {
    const check = checkPhone(phone);
    if (!check.valid) errors.phone = check.error ?? "Enter a valid phone number.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (message.length > 2000) errors.message = "Message is too long.";
  if (!input.consent) errors.consent = "Please confirm before submitting.";

  for (const { pattern, label } of PROHIBITED_PATTERNS) {
    if (pattern.test(message)) {
      errors.message = `Please remove the ${label} from your message. Identification numbers are never collected through this form.`;
    }
  }

  return errors;
}

function composeMessage(input: LeadInput): string {
  const note = (input.note ?? "").trim();
  return [input.message.trim(), note ? `Note: ${note}` : ""].filter(Boolean).join(" · ");
}

export async function createLead(clientId: string, input: LeadInput): Promise<LeadResult> {
  // Bots fill every field; a hidden one that humans never see filters most of
  // them. Answered as success so the bot has nothing to tune against.
  if ((input.honeypot ?? "").trim()) return { ok: true, reference: leadReference() };

  const errors = validateLead(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, message: "Please correct the highlighted fields." };
  }

  const externalId = (input.externalId ?? "").trim() || null;

  // Idempotency: a retried POST must not create a second lead. Checked before
  // insert for the common case, and again in the unique-violation branch below
  // for the genuine race where two retries arrive together.
  if (externalId) {
    const existing = await findByExternalId(clientId, externalId);
    if (existing) return { ok: true, reference: existing, duplicate: true };
  }

  const name = input.name.trim();
  const email = input.email.trim();
  const phoneCheck = input.phone.trim() ? checkPhone(input.phone.trim()) : null;
  const message = composeMessage(input);
  const clientType = (input.clientType ?? "").trim();
  const preferredContact = (input.preferredContact ?? "").trim();
  const calculatorId = (input.calculatorId ?? "").trim();

  let serviceId: string | null = null;
  let serviceLabel: string | null = null;
  const serviceSlug = (input.serviceSlug ?? "").trim();
  if (serviceSlug) {
    const [row] = await db
      .select()
      .from(services)
      .where(and(eq(services.clientId, clientId), eq(services.slug, serviceSlug)))
      .limit(1);
    serviceId = row?.id ?? null;
    serviceLabel = row?.title ?? null;
  }

  const ref = leadReference();

  try {
    const [created] = await db
      .insert(queries)
      .values({
        clientId,
        reference: ref,
        name,
        phone: phoneCheck?.normalised ?? null,
        email: email || null,
        clientType: (CLIENT_TYPES as readonly string[]).includes(clientType)
          ? (clientType as (typeof CLIENT_TYPES)[number])
          : null,
        serviceId,
        serviceLabel,
        message: message || null,
        preferredContact: (CONTACT_METHODS as readonly string[]).includes(preferredContact)
          ? (preferredContact as (typeof CONTACT_METHODS)[number])
          : null,
        leadSource: input.leadSource ?? (calculatorId ? "calculator" : "website"),
        landingPage: (input.landingPage ?? "").slice(0, 500) || null,
        formName: input.formName ?? (calculatorId ? "calculator_cta" : "contact_form"),
        // Only the calculator's identity travels with the lead — never any figure
        // that was entered into it.
        calculatorId: calculatorId || null,
        externalId,
        marketingConsent: input.marketingConsent ?? false,
        consentText:
          "Consented to being contacted about this enquiry using the details provided.",
        consentAt: new Date(),
      })
      .returning();

    await db.insert(queryStatusHistory).values({
      queryId: created.id,
      toStatus: "new",
      reason: "Submitted through the website",
      changedBy: "website",
    });

    return { ok: true, reference: ref };
  } catch (error) {
    // 23505 is unique_violation. With an externalId that means a concurrent
    // retry won the race, which is the idempotent outcome, not a failure.
    if (externalId && isUniqueViolation(error)) {
      const existing = await findByExternalId(clientId, externalId);
      if (existing) return { ok: true, reference: existing, duplicate: true };
    }
    throw error;
  }
}

async function findByExternalId(clientId: string, externalId: string): Promise<string | null> {
  const [row] = await db
    .select({ reference: queries.reference })
    .from(queries)
    .where(and(eq(queries.clientId, clientId), eq(queries.externalId, externalId)))
    .limit(1);
  return row?.reference ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
