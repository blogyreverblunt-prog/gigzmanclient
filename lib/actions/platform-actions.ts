"use server";

import { revalidatePath, updateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { calculators, clients, firmSettings, users, type OpeningHour } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { isVerticalId, getVerticalConfig } from "@/lib/verticals";
import { TEMPLATE_REGISTRY, getTenantPath } from "@/lib/templates";
import { SLUG_PATTERN } from "@/proxy";
import {
  CALCULATOR_DEFINITIONS,
  REALESTATE_CALCULATOR_DEFINITIONS,
  RATES_VERSION,
  REALESTATE_RATES_VERSION,
  TAX_YEAR,
} from "@/lib/calculators/registry";
import { tenantDataTag, tenantSlugTag } from "@/lib/cache-tags";
import { putObject, deleteObject } from "@/lib/storage";
import {
  ACCEPTED_LOGO_TYPES,
  ICON_SIZES,
  ImageRejected,
  MAX_LOGO_BYTES,
  buildIconSet,
  buildOgImage,
  normaliseLogo,
} from "@/lib/brand-images";
import { SITEMAP_FAMILIES } from "@/lib/sitemap";
import { featureEnabled, type ClientFeatures } from "@/lib/features";
import { vastuSectorTenants } from "@/lib/platform/clients";
import {
  FEATURES_REALESTATE_ONLY_REFUSAL,
  HOME_LOAN_DSA_REFUSAL,
  ICAI_REVIEWS_REFUSAL,
  MANAGED_SOCIAL_KEYS,
  OPENING_DAYS,
  vastuDecision,
} from "@/lib/platform/feature-copy";

/**
 * The platform dashboard's write side: three actions, one per panel on
 * `/clients/[slug]`, so a refusal in one does not discard the operator's edits
 * in another.
 *
 * These are the first actions in this codebase that write to an ARBITRARY
 * tenant's rows. `lib/actions/dashboard-actions.ts` is scoped to the caller's
 * own client and asserts ownership; there is no owning tenant to compare against
 * here, because a platform admin may legitimately edit any client. So the two
 * checks that matter are "the caller is the platform admin" and "the target row
 * is what the database says it is, not what the payload claims".
 */

/**
 * Re-declared rather than imported from `dashboard-actions.ts`: importing it
 * would pull that module's `lib/auth.ts`, `node:fs` and image-upload imports
 * into the platform graph for a two-field interface.
 */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown): ActionResult {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return { ok: false, message };
}

/** Every text field follows the house idiom: trimmed, empty becomes NULL. */
function text(formData: FormData, name: string): string | null {
  return String(formData.get(name) ?? "").trim() || null;
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/**
 * The row this action is about to write, re-read from the database.
 *
 * The `clientId` arriving in `FormData` selects the row and nothing more — every
 * guard below then reads `row.vertical`, `row.slug` and `row.features` from what
 * came back, never from the payload. A posted `vertical=cafirm` cannot conjure
 * the ICAI guard away, and a posted `features` object cannot be persisted.
 */
async function loadClientRow(clientId: string) {
  if (!clientId) return null;
  // A malformed id is a client error, not a crash: `uuid = 'HACKED'` is a
  // Postgres type error, so the cast is guarded rather than left to throw.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return null;
  }
  const [row] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return row ?? null;
}

/**
 * Expire everything the public site caches for this tenant.
 *
 * `updateTag`, not `revalidateTag`. In Next 16.3.3 the single-argument
 * `revalidateTag(tag)` is deprecated and warns, and `revalidateTag(tag, "max")`
 * keeps serving the stale copy for up to a year while it revalidates behind the
 * request — which is exactly wrong for an operator who has just pressed Save and
 * is about to open the site to check. `updateTag` expires immediately and is
 * only callable from a Server Action, which is what these are.
 *
 * Both tags, because the two producers key on different things: the slug tag
 * covers `lookupClientBySlug` in lib/tenant.ts, the client tag covers the cached
 * reads in lib/content.ts. Each is inherited by the ISR entry of every public
 * page that read it, so these two lines expire this tenant's rendered HTML as
 * well as its cached rows — and no other tenant's.
 */
function invalidateTenant(row: { id: string; slug: string }) {
  updateTag(tenantSlugTag(row.slug));
  updateTag(tenantDataTag(row.id));
}

/**
 * The sitemaps are plain route handlers with `revalidate = 3600` that read
 * `clients` directly, so they carry none of the tags above. They are addressed
 * by literal pathname, which is the one `revalidatePath` form that actually
 * matches: Next turns the argument into the implicit tag `_N_T_<path>`, and a
 * rendered entry carries its resolved pathname as exactly that tag. The
 * `"/site"`-style calls in lib/actions/dashboard-actions.ts do not match
 * anything and never have.
 */
function invalidateSitemaps() {
  revalidatePath("/sitemap.xml");
  for (const family of SITEMAP_FAMILIES) revalidatePath(`/sitemaps/${family.id}.xml`);
}

// ────────────────────────────────────────────────────── identity and routing

/**
 * A bare hostname — no scheme, no path, no port. `www.` is deliberately NOT
 * stripped: `HOST_TENANT_MAP` in lib/domains.ts distinguishes `highproperties.in`
 * from `www.highproperties.in` explicitly, so normalising them together would
 * make the column disagree with the map.
 */
function normaliseDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function updateClientIdentity(formData: FormData): Promise<ActionResult> {
  try {
    // A Server Action is a directly reachable POST endpoint. The gated page
    // having rendered proves nothing about the caller, and unlike the tenant
    // dashboard's actions a hole here is not one client's bug — it is an
    // unauthenticated write path into every client's live content.
    await requirePlatformAdmin("/");

    const row = await loadClientRow(String(formData.get("clientId") ?? ""));
    if (!row) return { ok: false, message: "Client not found." };

    // I1/I2 are belt AND braces. `slug` and `vertical` never appear in the
    // `.set()` below, so a direct POST carrying them changes nothing whatever
    // this returns; the refusal exists so a future reader does not "helpfully"
    // wire the field up, and so the operator is told rather than ignored.
    const postedSlug = String(formData.get("slug") ?? "").trim();
    if (postedSlug && postedSlug !== row.slug) {
      return {
        ok: false,
        message:
          "The client ID cannot be changed after creation — it is in every URL of this client's site. " +
          "Create a new client instead.",
      };
    }

    const postedVertical = String(formData.get("vertical") ?? "").trim();
    if (postedVertical && postedVertical !== row.vertical) {
      return { ok: false, message: "A client's vertical cannot be changed after creation." };
    }

    const displayName = String(formData.get("displayName") ?? "").trim();
    if (!displayName) return { ok: false, message: "A display name is required." };

    const rawDomain = String(formData.get("customDomain") ?? "");
    const customDomain = rawDomain.trim() ? normaliseDomain(rawDomain) : null;
    if (customDomain && !HOSTNAME.test(customDomain)) {
      return { ok: false, message: "Enter a bare hostname, for example highproperties.in." };
    }

    if (customDomain) {
      // `clients.custom_domain` has no unique constraint, and both host-mode
      // resolvers (`getTenant()` and `submitQuery()`) `.limit(1)` with no
      // tiebreak — so two rows sharing a domain is a cross-tenant resolution
      // bug, not a cosmetic duplicate. Enforced here until a partial unique
      // index exists (deferred to CD-03b, which writes a migration anyway).
      const [clash] = await db
        .select({ slug: clients.slug })
        .from(clients)
        .where(and(sql`lower(${clients.customDomain}) = ${customDomain}`, ne(clients.id, row.id)))
        .limit(1);
      if (clash) {
        return { ok: false, message: `That domain is already assigned to ${clash.slug}.` };
      }
    }

    const isActive = checked(formData, "isActive");

    await db
      .update(clients)
      .set({ displayName, customDomain, isActive })
      .where(eq(clients.id, row.id));

    invalidateTenant(row);
    // `isActive` changes sitemap membership, and `customDomain` changes
    // `prefixFor()` in path mode, so every URL this client advertises moves.
    invalidateSitemaps();

    return { ok: true, message: "Identity and routing saved." };
  } catch (error) {
    // `requirePlatformAdmin()` redirects when the 1h session has expired, and a
    // redirect is thrown. Without this the catch would swallow it and return
    // "NEXT_REDIRECT" to the operator as if it were a validation message.
    unstable_rethrow(error);
    return fail(error);
  }
}

// ─────────────────────────────────────────────────── business details

function readOpeningHours(formData: FormData): OpeningHour[] {
  // Full replace in fixed Monday…Sunday order, which is correct because the
  // 7-row grid represents the value completely. `social_links` below is merged
  // instead, for the opposite reason.
  return OPENING_DAYS.map((day) => {
    const closed = checked(formData, `hours-${day}-closed`);
    return {
      day,
      opens: closed ? null : text(formData, `hours-${day}-opens`),
      closes: closed ? null : text(formData, `hours-${day}-closes`),
      closed,
    };
  });
}

function mergeSocialLinks(
  existing: Record<string, string> | null,
  formData: FormData,
): Record<string, string> {
  // Merged, not replaced: `social_links` can hold keys this form does not
  // render (an `x` handle seeded from YAML, say, which reaches `sameAs` in the
  // organisation JSON-LD through lib/schema-org.ts even though FooterV2 has no
  // icon for it). A blind replace would delete those silently.
  const next: Record<string, string> = { ...(existing ?? {}) };
  for (const key of MANAGED_SOCIAL_KEYS) {
    const value = text(formData, `social-${key}`);
    if (value) next[key] = value;
    else delete next[key];
  }
  return next;
}

/**
 * `latitude`/`longitude` are `varchar(32)`, not `real` — pre-existing, and
 * changing it is a migration this increment must not carry. So the action
 * applies the validation the column type would otherwise give: a bad pair
 * reaches `geo` in the organisation JSON-LD and the map.
 */
function coordinatesValid(lat: string | null, lng: string | null): boolean {
  if (lat === null && lng === null) return true;
  if (lat === null || lng === null) return false;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  return latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
}

export async function updateClientBusinessDetails(formData: FormData): Promise<ActionResult> {
  try {
    // A Server Action is a directly reachable POST endpoint. The gated page
    // having rendered proves nothing about the caller, and unlike the tenant
    // dashboard's actions a hole here is not one client's bug — it is an
    // unauthenticated write path into every client's live content.
    await requirePlatformAdmin("/");

    const row = await loadClientRow(String(formData.get("clientId") ?? ""));
    if (!row) return { ok: false, message: "Client not found." };

    const firmName = String(formData.get("firmName") ?? "").trim();
    if (!firmName) return { ok: false, message: "The firm name is required." };

    const reviewsEnabled = checked(formData, "reviewsEnabled");
    // The vertical comes from the freshly-read row, never from the payload.
    // Refusing the whole save rather than coercing the flag to false: silent
    // coercion would show "Saved." next to a checkbox the operator had ticked.
    if (row.vertical === "cafirm" && reviewsEnabled) {
      return { ok: false, message: ICAI_REVIEWS_REFUSAL };
    }

    const latitude = text(formData, "latitude");
    const longitude = text(formData, "longitude");
    if (!coordinatesValid(latitude, longitude)) {
      return {
        ok: false,
        message: "Latitude and longitude must both be decimal numbers, or both be empty.",
      };
    }

    const [existing] = await db
      .select()
      .from(firmSettings)
      .where(eq(firmSettings.clientId, row.id))
      .limit(1);
    // No insert. Creating the settings row is CD-03b's transaction; inserting a
    // partial one here would produce exactly the half-configured client that
    // increment is designed to prevent.
    if (!existing) return { ok: false, message: "This client has no settings row yet." };

    await db
      .update(firmSettings)
      .set({
        firmName,
        tagline: text(formData, "tagline"),
        overview: text(formData, "overview"),
        establishedYear: text(formData, "establishedYear"),
        firmRegistrationNumber: text(formData, "firmRegistrationNumber"),
        businessCategory: text(formData, "businessCategory"),
        phone: text(formData, "phone"),
        whatsapp: text(formData, "whatsapp"),
        email: text(formData, "email"),
        notificationEmail: text(formData, "notificationEmail"),
        addressLine: text(formData, "addressLine"),
        locality: text(formData, "locality"),
        region: text(formData, "region"),
        postalCode: text(formData, "postalCode"),
        country: text(formData, "country"),
        latitude,
        longitude,
        googleMapsUrl: text(formData, "googleMapsUrl"),
        openingHours: readOpeningHours(formData),
        socialLinks: mergeSocialLinks(existing.socialLinks, formData),
        reviewsEnabled,
        pricingEnabled: checked(formData, "pricingEnabled"),
        awardsEnabled: checked(formData, "awardsEnabled"),
        clientLogosEnabled: checked(formData, "clientLogosEnabled"),
        teamEnabled: checked(formData, "teamEnabled"),
        updatedAt: new Date(),
      })
      .where(eq(firmSettings.clientId, row.id));

    // No `invalidateSitemaps()`: no `firm_settings` field appears in a sitemap
    // URL, so the URL set cannot have moved.
    invalidateTenant(row);

    return { ok: true, message: "Business details saved." };
  } catch (error) {
    unstable_rethrow(error);
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────── feature flags

export async function updateClientFeatures(formData: FormData): Promise<ActionResult> {
  try {
    // A Server Action is a directly reachable POST endpoint. The gated page
    // having rendered proves nothing about the caller, and unlike the tenant
    // dashboard's actions a hole here is not one client's bug — it is an
    // unauthenticated write path into every client's live content.
    await requirePlatformAdmin("/");

    const row = await loadClientRow(String(formData.get("clientId") ?? ""));
    if (!row) return { ok: false, message: "Client not found." };

    // All five flags gate premium-v2 real-estate surfaces, so writing any of
    // them for another vertical is meaningless at best and a false claim at
    // worst. Read off the freshly-loaded row, never the payload — the same shape
    // as `updateClientBusinessDetails`'s ICAI guard, and for a related reason:
    // `homeLoan` publishes an "authorised channel partner" claim, which on a
    // chartered-accountancy firm is a misrepresentation and an ICAI advertising
    // breach. Before CD-02 this could not happen, because the gate was a
    // hardcoded Set of real-estate slugs; making the gate row data and then
    // making the row editable is what opened it, so it is closed here.
    //
    // The whole save is refused rather than the offending keys being dropped:
    // silently coercing them would show "Saved." next to switches the operator
    // had set. `components/platform/FeatureToggles.tsx` is not rendered at all
    // for such a tenant, but that is a courtesy — this is the guard.
    if (row.vertical !== "realestate") {
      return { ok: false, message: FEATURES_REALESTATE_ONLY_REFUSAL };
    }

    // Rebuilt from the five known keys rather than spread from the posted form,
    // so an attacker-supplied `features` key cannot be persisted. Writing all
    // five explicitly means the stored object no longer leans on
    // `FEATURE_DEFAULTS` for this row — safe, because the form was seeded from
    // `featureEnabled(row, key)`, so the resolved value is preserved exactly.
    const next: ClientFeatures = {
      propertyMap: checked(formData, "propertyMap"),
      propertyManagementSection: checked(formData, "propertyManagementSection"),
      propertyManagementPage: checked(formData, "propertyManagementPage"),
      vastuSectors: checked(formData, "vastuSectors"),
      homeLoan: checked(formData, "homeLoan"),
    };

    // Both guards fire on the TRANSITION only. Re-saving a panel with a flag
    // already on must not demand the acknowledgement again, or an operator
    // cannot change `propertyMap` on high-properties without re-confirming a DSA
    // relationship — and a confirmation demanded routinely stops being read.
    if (!featureEnabled(row, "vastuSectors") && next.vastuSectors) {
      const enabled = await vastuSectorTenants();
      const decision = vastuDecision(
        enabled.filter((t) => t.id !== row.id).map((t) => t.slug),
        checked(formData, "vastuSectorsAck"),
      );
      if (!decision.ok) return { ok: false, message: decision.message };
    }

    if (!featureEnabled(row, "homeLoan") && next.homeLoan && !checked(formData, "homeLoanDsaConfirmed")) {
      return { ok: false, message: HOME_LOAN_DSA_REFUSAL };
    }

    await db.update(clients).set({ features: next }).where(eq(clients.id, row.id));

    invalidateTenant(row);
    // The `home-loan` and `vastu-sectors` sitemap families are feature-gated in
    // `entriesForFamily`, so a flag change moves the URL set.
    invalidateSitemaps();

    return { ok: true, message: "Feature flags saved." };
  } catch (error) {
    unstable_rethrow(error);
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────── client creation

/**
 * Creating a client is the point of the whole programme: CD-01 moved the
 * template assignment onto the row and CD-02 moved the feature flags, so that a
 * new `clients` row is now sufficient to produce a working site. Before them
 * this action was impossible — onboarding meant editing three source files and
 * running `pnpm seed:client`.
 *
 * It deliberately does NOT shell out to that script. The script's job is to
 * bootstrap a tenant from `clients/<slug>/*.yaml`; this one creates a tenant
 * that has no YAML at all, and spawning a child process from a Server Action to
 * write rows we can write directly would be indirection with a worse failure
 * mode.
 */
export interface CreateClientResult extends ActionResult {
  /**
   * Present only on the single successful response that created the row. The
   * generated password is never stored in plaintext and never re-read, so this
   * is the one moment it can be shown — which is why this action returns it
   * instead of redirecting. A redirect would have to carry it in a query string,
   * putting a live credential into browser history, the referer header and every
   * access log between here and the operator.
   */
  created?: { slug: string; sitePath: string; adminEmail: string; password: string };
}

/** Static segments under `/clients/` that a slug would shadow in the router. */
const RESERVED_SLUGS = new Set(["new", "login", "site", "api", "sitemaps"]);

export async function createClient(formData: FormData): Promise<CreateClientResult> {
  try {
    await requirePlatformAdmin("/");

    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const vertical = String(formData.get("vertical") ?? "").trim();
    const templateKeyRaw = String(formData.get("templateKey") ?? "").trim();

    if (!displayName) return { ok: false, message: "Business name is required." };

    // The same pattern `proxy.ts` routes with, imported rather than re-typed:
    // a slug it rejects has no reachable URL at all.
    if (!SLUG_PATTERN.test(slug)) {
      return {
        ok: false,
        message:
          "Client ID must be lowercase letters, numbers and hyphens, start and end with a letter or number, and be at least two characters.",
      };
    }
    if (RESERVED_SLUGS.has(slug)) {
      // `/clients/new` is a real page; a client with that slug would be
      // unreachable from the list because Next resolves the static segment first.
      return { ok: false, message: `"${slug}" is reserved and cannot be used as a client ID.` };
    }

    if (!isVerticalId(vertical)) {
      return { ok: false, message: "Choose an industry." };
    }

    // A realestate row without a template the code can render 404s every page of
    // its site (`getTenantBySlug`), and nothing on the resulting screen would say
    // why. Refused at creation rather than left for the operator to discover.
    let templateKey: string | null = null;
    if (vertical === "realestate") {
      if (!templateKeyRaw || !Object.hasOwn(TEMPLATE_REGISTRY, templateKeyRaw)) {
        return {
          ok: false,
          message: `A real-estate client needs a template. Valid options: ${Object.keys(TEMPLATE_REGISTRY).join(", ")}.`,
        };
      }
      templateKey = templateKeyRaw;
    }

    const [existing] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, slug))
      .limit(1);
    if (existing) {
      return { ok: false, message: `A client with the ID "${slug}" already exists.` };
    }

    const config = getVerticalConfig(vertical);
    const adminEmail = `admin@${slug}.local`;
    // Same shape as `scripts/seed-client.ts` so a wizard-created client and a
    // seeded one are indistinguishable afterwards.
    const password = randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 12);

    const calculatorDefs =
      vertical === "cafirm"
        ? CALCULATOR_DEFINITIONS
        : vertical === "realestate"
          ? REALESTATE_CALCULATOR_DEFINITIONS
          : [];
    const calculatorVersion = vertical === "cafirm" ? RATES_VERSION : REALESTATE_RATES_VERSION;
    const calculatorTaxYear = vertical === "cafirm" ? TAX_YEAR : null;

    // One transaction: a client row with no `firm_settings` renders a site with
    // no name, phone or address, and a client with no admin user cannot be
    // handed over. A partial create is worse than no create, because the slug is
    // then taken and the operator cannot retry with it.
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({
          slug,
          vertical,
          displayName,
          templateKey,
          customDomain: null,
          isActive: true,
          isDemo: false,
          // `{}` means "every documented default" — see lib/features.ts. For a
          // new client that is map on, and the three branded, regulated or
          // build-expensive families off, which is the right starting point.
          features: {},
        })
        .returning();

      await tx.insert(firmSettings).values({
        clientId: row.id,
        firmName: displayName,
        // Every other field stays NULL on purpose. AGENTS.md: never invent
        // client facts — an empty field renders nothing, an invented one ships a
        // lie on a real business's website. The operator fills them in from the
        // edit screen, or CD-04 pulls them from the Google Business Profile.
        //
        // `reviewsEnabled` comes from the vertical's defaults, which is what
        // keeps it false for a cafirm tenant: ICAI prohibits testimonials,
        // ratings and endorsements on a practice's own site.
        reviewsEnabled: config.defaults.reviewsEnabled,
      });

      for (const def of calculatorDefs) {
        await tx.insert(calculators).values({
          clientId: row.id,
          key: def.key,
          title: def.title,
          description: def.description,
          version: calculatorVersion,
          taxYear: calculatorTaxYear,
          disclaimer: def.disclaimer,
          sourceNote: def.sourceNote,
          sortOrder: def.sortOrder,
        });
      }

      await tx.insert(users).values({
        clientId: row.id,
        email: adminEmail,
        passwordHash,
        name: "Administrator",
        role: "admin",
      });

      return row;
    });

    // The new row changes what `/` lists and what every sitemap contains. Its
    // own tenant tags have nothing cached against them yet, but invalidating
    // them costs nothing and means a slug reused after a deletion cannot serve a
    // predecessor's cached rows.
    invalidateTenant(created);
    invalidateSitemaps();
    revalidatePath("/");

    return {
      ok: true,
      message: `Created ${displayName}.`,
      created: {
        slug: created.slug,
        sitePath: getTenantPath(created),
        adminEmail,
        password,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    return fail(error);
  }
}

// ──────────────────────────────────────────────────────────────── branding

/**
 * One upload produces every brand asset this client needs.
 *
 * The alternative was three uploads — logo, favicon, share card — and it is a
 * worse design for the person doing the work: the three are always cut from the
 * same mark, and asking a non-technical operator to produce a 512px square and
 * a 1200x630 card from a supplied wordmark is asking them to own a design task
 * they cannot do. One file in, `lib/brand-images.ts` derives the rest.
 *
 * The share card stays overridable separately (`ogImageUrl` is editable in its
 * own right) for the client who has had one designed, but nobody has to.
 */
export async function uploadClientBranding(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin("/");

    const row = await loadClientRow(String(formData.get("clientId") ?? ""));
    if (!row) return { ok: false, message: "Client not found." };

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose a logo file to upload." };
    }
    if (file.size > MAX_LOGO_BYTES) {
      return { ok: false, message: "The logo must be 5MB or smaller." };
    }
    // Validated server-side against the actual declared type, not the `accept`
    // attribute — that is a hint to the file picker, not a constraint on a POST.
    if (!Object.hasOwn(ACCEPTED_LOGO_TYPES, file.type)) {
      return { ok: false, message: "Upload a PNG, JPEG, WebP or SVG file." };
    }

    const source = Buffer.from(await file.arrayBuffer());

    let logo: Awaited<ReturnType<typeof normaliseLogo>>;
    let icons: Awaited<ReturnType<typeof buildIconSet>>;
    let ogImage: Buffer;
    try {
      // Sequential rather than Promise.all: if the logo is going to be rejected
      // for being too small, there is no point rendering four favicons and a
      // share card from it first.
      logo = await normaliseLogo(source);
      icons = await buildIconSet(source);
      ogImage = await buildOgImage(source);
    } catch (error) {
      // A rejection is the operator's problem to fix and says how; anything else
      // is ours and should not be dressed up as advice.
      if (error instanceof ImageRejected) return { ok: false, message: error.message };
      throw error;
    }

    // Content-addressed by a random stem so a re-upload never collides with the
    // cached copy of its predecessor. Browsers and CDNs cache favicons hard, and
    // reusing `logo.png` would leave the old mark on screen indefinitely.
    const stem = randomBytes(8).toString("hex");
    const base = `${row.id}/brand/${stem}`;

    const [logoUrl] = await Promise.all([
      putObject(`${base}-logo.png`, logo.png, "image/png"),
      putObject(`${base}-logo.webp`, logo.webp, "image/webp"),
      ...ICON_SIZES.map((size) =>
        putObject(`${base}-icon-${size}.png`, icons[size], "image/png"),
      ),
      putObject(`${base}-og.jpg`, ogImage, "image/jpeg"),
    ]);

    // The icon base is stored without the size suffix; `iconsFor` appends it.
    // Derived from the logo URL so the two cannot point at different uploads.
    const iconBaseUrl = logoUrl.replace(/-logo\.png$/, "-icon");
    const ogImageUrl = logoUrl.replace(/-logo\.png$/, "-og.jpg");

    const [previous] = await db
      .select({ logoUrl: firmSettings.logoUrl, iconBaseUrl: firmSettings.iconBaseUrl })
      .from(firmSettings)
      .where(eq(firmSettings.clientId, row.id))
      .limit(1);

    await db
      .update(firmSettings)
      .set({ logoUrl, iconBaseUrl, ogImageUrl, updatedAt: new Date() })
      .where(eq(firmSettings.clientId, row.id));

    // Only the previous UPLOADED logo is cleaned up. The five existing clients
    // point at committed files under public/verticals/, which are part of the
    // repository and must survive someone uploading over them — `deleteObject`
    // only acts on `/uploads/` paths and blob URLs, so those are left alone.
    if (previous?.logoUrl && previous.logoUrl !== logoUrl) {
      await deleteObject(previous.logoUrl);
    }

    invalidateTenant(row);

    return {
      ok: true,
      message: `Logo updated — rendered at ${logo.width}×${logo.height}, with a favicon set and a share card.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return fail(error);
  }
}

// ───────────────────────────────────────────────────────── search appearance

/**
 * The two paste-once technical fields, plus the optional title/description
 * override.
 *
 * `seoTitle` and `seoDescription` are OVERRIDES, and empty means "generate
 * one" — so they are written as NULL when blank rather than as an empty
 * string. The distinction is the whole mechanism: a stored empty string would
 * be indistinguishable from an override of "" and would suppress the generated
 * text entirely.
 *
 * Nothing here ever writes the generated text into the columns. Doing so would
 * freeze today's output, and the title would stop tracking the business name,
 * category and locality it was composed from — which is exactly the failure
 * that made per-page SEO fields useless on this kind of site in the first place.
 */
export async function updateClientSeo(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin("/");

    const row = await loadClientRow(String(formData.get("clientId") ?? ""));
    if (!row) return { ok: false, message: "Client not found." };

    await db
      .update(firmSettings)
      .set({
        seoTitle: text(formData, "seoTitle"),
        seoDescription: text(formData, "seoDescription"),
        ga4MeasurementId: text(formData, "ga4MeasurementId"),
        searchConsoleVerification: text(formData, "searchConsoleVerification"),
        updatedAt: new Date(),
      })
      .where(eq(firmSettings.clientId, row.id));

    invalidateTenant(row);

    return { ok: true, message: "Search appearance saved." };
  } catch (error) {
    unstable_rethrow(error);
    return fail(error);
  }
}
