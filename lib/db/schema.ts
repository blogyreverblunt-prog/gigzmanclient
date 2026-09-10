import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  real,
  date,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import type { ClientFeatures } from "@/lib/features";
import type { HeroCopyValue } from "@/lib/premium-v2/hero-copy-types";

/**
 * Every content table is scoped by `clientId` so a single deployment can serve
 * many client sites, resolved per-request from the tenant middleware.
 */

export const queryStatus = pgEnum("query_status", [
  "new",
  "contact_attempted",
  "connected",
  "qualified",
  "consultation_scheduled",
  "converted",
  "not_converted",
  "spam",
  "closed",
]);

export const notConvertedReason = pgEnum("not_converted_reason", [
  "no_response",
  "service_not_available",
  "budget_mismatch",
  "requirement_postponed",
  "selected_another_firm",
  "invalid_query",
  "duplicate",
  "other",
]);

export const clientType = pgEnum("client_type", [
  "individual",
  "salaried_professional",
  "proprietorship",
  "partnership_llp",
  "company",
  "startup",
  "other",
]);

export const contactMethod = pgEnum("contact_method", ["phone", "email", "whatsapp"]);

export const updateStatus = pgEnum("update_status", [
  "draft",
  "review_required",
  "approved",
  "published",
  "outdated",
  "archived",
]);

/** Mirrors the calculator lifecycle: rates must pass CA review before going Active. */
export const calculatorStatus = pgEnum("calculator_status", [
  "draft",
  "testing",
  "ca_review_required",
  "active",
  "update_required",
  "archived",
]);

export const userRole = pgEnum("user_role", ["admin", "editor"]);

export const propertyPurpose = pgEnum("property_purpose", ["buy", "rent"]);

export const propertyStatus = pgEnum("property_status", [
  "new_launch",
  "under_construction",
  "ready_to_move",
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  vertical: varchar("vertical", { length: 60 }).notNull().default("cafirm"),
  /**
   * Which template in `lib/templates` TEMPLATE_REGISTRY this tenant renders.
   *
   * Nullable because only `realestate` carries a template today — a `cafirm`
   * tenant has none, and null is the correct answer, not a missing value.
   * A `realestate` row with a null (or unrecognised) value 404s in
   * `getTenantBySlug`; it does not render untemplated under another client's
   * chrome.
   *
   * `varchar`, not a `pgEnum`: the valid set is the code-side registry, so
   * shipping a second template must not require a migration, and the check
   * belongs in `templateKeyFor()` where the registry lives. 60 chars matches
   * `vertical`.
   */
  templateKey: varchar("template_key", { length: 60 }),
  /**
   * Per-client feature gates. Five booleans that decide which optional
   * premium-v2 sections and route families this tenant publishes.
   *
   * The reasoning for each flag lives next to its accessor
   * (`lib/premium-v2/home-sections.ts`, `lib/vastu/enabled.ts`,
   * `lib/home-loan/enabled.ts`) — two of them are not preferences: home-loan
   * asserts a DSA relationship, and vastu sectors has already failed a deploy.
   *
   * jsonb rather than five boolean columns because the set grows (CD-03 and
   * CD-07 add more) and a flag should not cost a migration. It is NOT hiding a
   * relationship: this is a closed set of booleans owned by exactly one row,
   * with no cardinality, no history and no query predicate — nothing here is
   * ever a `WHERE` clause. Do not put anything relational in it.
   *
   * `notNull().default({})` so a row created without one is well-defined:
   * `{}` means "every documented default", not "unknown". The defaults are NOT
   * uniform — `propertyMap` defaults true, the other four false — and they are
   * declared once in `FEATURE_DEFAULTS`.
   *
   * Read only through `featureEnabled()`. jsonb has no type checking, so a
   * hand-written `"yes"`, `1` or `null` must not reach a boolean gate.
   */
  features: jsonb("features").$type<ClientFeatures>().notNull().default({}),

  /**
   * Per-client homepage hero copy, or null for the template default.
   *
   * On `clients` rather than `firm_settings` for the same reason `features`
   * is: this is template presentation keyed to the tenant, not part of the
   * business record `firm_settings` holds, and the tenant row is already
   * loaded wherever the hero renders.
   *
   * jsonb rather than eight columns because it is one composed object edited
   * as a unit — the four stat tiles are positional and only meaningful
   * together. Null means `DEFAULT` in lib/premium-v2/positioning.ts, which
   * stays in code so a newly created client has a working hero with no data
   * entry at all.
   */
  heroCopy: jsonb("hero_copy").$type<HeroCopyValue>(),
  displayName: text("display_name").notNull(),
  customDomain: varchar("custom_domain", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  /** Marks a tenant as a template-library showcase rather than a real client. */
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const firmSettings = pgTable("firm_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" })
    .unique(),

  firmName: text("firm_name").notNull(),
  tagline: text("tagline"),
  overview: text("overview"),
  establishedYear: varchar("established_year", { length: 10 }),
  firmRegistrationNumber: varchar("firm_registration_number", { length: 60 }),

  // Single source of truth for NAP — footer, contact page, JSON-LD and map all read
  // from here so the site can never drift from the Google Business Profile.
  phone: varchar("phone", { length: 40 }),
  whatsapp: varchar("whatsapp", { length: 40 }),
  email: varchar("email", { length: 160 }),
  addressLine: text("address_line"),
  locality: varchar("locality", { length: 120 }),
  region: varchar("region", { length: 120 }),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 80 }).default("India"),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  googleMapsUrl: text("google_maps_url"),
  businessCategory: varchar("business_category", { length: 120 }),
  /** Path or URL to the firm's logo; falls back to the built-in mark when unset. */
  logoUrl: text("logo_url"),

  /**
   * Base path of this client's favicon set, without the size suffix:
   * `<base>-32.png`, `-180.png`, `-192.png`, `-512.png`. Stored as a base
   * rather than four columns because the four are always generated together
   * from one source image and never diverge.
   *
   * Replaces the hardcoded ICON_SETS map in lib/brand-icons.ts, which could
   * only ever describe clients someone had edited that file for. Null means
   * the app default — never another tenant's mark.
   */
  iconBaseUrl: text("icon_base_url"),

  /**
   * Per-client social share image. Null falls back to the shared
   * public/brand/og-hero.jpg, which is what every client used before CD-05.
   */
  ogImageUrl: text("og_image_url"),

  /** [{ day, opens, closes, closed }] — drives both the UI and openingHoursSpecification. */
  openingHours: jsonb("opening_hours").$type<OpeningHour[]>().default([]),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().default({}),

  ga4MeasurementId: varchar("ga4_measurement_id", { length: 40 }),
  searchConsoleVerification: text("search_console_verification"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),

  /**
   * Section visibility. `reviewsEnabled` ships false: ICAI's Code of Ethics
   * prohibits testimonials, star ratings and endorsements on a CA firm's own
   * site, so this stays off unless the firm's CA decides otherwise.
   */
  reviewsEnabled: boolean("reviews_enabled").notNull().default(false),
  pricingEnabled: boolean("pricing_enabled").notNull().default(true),
  awardsEnabled: boolean("awards_enabled").notNull().default(true),
  clientLogosEnabled: boolean("client_logos_enabled").notNull().default(true),
  teamEnabled: boolean("team_enabled").notNull().default(true),

  notificationEmail: varchar("notification_email", { length: 160 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OpeningHour = {
  day: string;
  opens: string | null;
  closes: string | null;
  closed: boolean;
};

export const officeLocations = pgTable("office_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  addressLine: text("address_line"),
  locality: varchar("locality", { length: 120 }),
  region: varchar("region", { length: 120 }),
  postalCode: varchar("postal_code", { length: 20 }),
  phone: varchar("phone", { length: 40 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  designation: text("designation"),
  qualifications: text("qualifications"),
  membershipNumber: varchar("membership_number", { length: 60 }),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 140 }).notNull(),
    title: text("title").notNull(),
    // Plain varchar rather than a pgEnum: valid categories differ per vertical
    // (lib/verticals/*.ts serviceCategories) and are validated at the
    // application layer rather than by a database-level enum, which would need
    // a migration every time a vertical's category set changes.
    category: varchar("category", { length: 60 }).notNull(),
    summary: text("summary"),

    overview: text("overview"),
    whoNeedsThis: jsonb("who_needs_this").$type<string[]>().default([]),
    scopeOfAssistance: jsonb("scope_of_assistance").$type<string[]>().default([]),
    documentsRequired: jsonb("documents_required").$type<string[]>().default([]),
    engagementProcess: jsonb("engagement_process").$type<ProcessStep[]>().default([]),
    timelines: text("timelines"),
    considerations: text("considerations"),
    faqs: jsonb("faqs").$type<Faq[]>().default([]),

    /** Services only a CA may render are tracked separately for compliance review. */
    isCaExclusive: boolean("is_ca_exclusive").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    reviewedBy: text("reviewed_by"),
    lastReviewedAt: date("last_reviewed_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("services_client_slug_unique").on(t.clientId, t.slug)],
);

export type ProcessStep = { step: string; detail: string };
export type Faq = { question: string; answer: string };

export const queries = pgTable("queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  reference: varchar("reference", { length: 24 }).notNull().unique(),

  name: text("name").notNull(),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 160 }),
  clientType: clientType("client_type"),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
  serviceLabel: text("service_label"),
  message: text("message"),
  preferredContact: contactMethod("preferred_contact"),

  leadSource: varchar("lead_source", { length: 80 }),
  landingPage: text("landing_page"),
  formName: varchar("form_name", { length: 80 }),
  /** Set when the query originated from a calculator CTA — never carries financial values. */
  calculatorId: varchar("calculator_id", { length: 60 }),
  calculatorVersion: varchar("calculator_version", { length: 30 }),
  taxYear: varchar("tax_year", { length: 60 }),

  status: queryStatus("status").notNull().default("new"),
  priority: varchar("priority", { length: 20 }).default("normal"),
  assignedTo: text("assigned_to"),
  followUpDate: date("follow_up_date"),
  notConvertedReason: notConvertedReason("not_converted_reason"),

  marketingConsent: boolean("marketing_consent").notNull().default(false),
  consentText: text("consent_text"),
  consentAt: timestamp("consent_at", { withTimezone: true }),

  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
});

export const queryStatusHistory = pgTable("query_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  queryId: uuid("query_id")
    .notNull()
    .references(() => queries.id, { onDelete: "cascade" }),
  fromStatus: queryStatus("from_status"),
  toStatus: queryStatus("to_status").notNull(),
  reason: text("reason"),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const queryNotes = pgTable("query_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  queryId: uuid("query_id")
    .notNull()
    .references(() => queries.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorName: text("author_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const professionalUpdates = pgTable(
  "professional_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 180 }).notNull(),
    title: text("title").notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    excerpt: text("excerpt"),
    body: text("body"),

    /** Applicable period is mandatory for anything tax-year sensitive. */
    applicableYear: varchar("applicable_year", { length: 60 }),
    sources: jsonb("sources").$type<Source[]>().default([]),

    status: updateStatus("status").notNull().default("draft"),
    authorName: text("author_name"),
    reviewerName: text("reviewer_name"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastReviewedAt: date("last_reviewed_at"),

    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("updates_client_slug_unique").on(t.clientId, t.slug)],
);

export type Source = { label: string; url: string };

export const complianceEvents = pgTable("compliance_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  description: text("description"),
  applicableTo: text("applicable_to"),

  /**
   * `dueDate` is the original statutory date and is never overwritten; an
   * extension is recorded alongside it so the history stays auditable.
   */
  dueDate: date("due_date").notNull(),
  extendedDueDate: date("extended_due_date"),
  extensionNote: text("extension_note"),

  sourceLabel: text("source_label"),
  sourceUrl: text("source_url"),
  lastVerifiedAt: date("last_verified_at"),

  isRecurring: boolean("is_recurring").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calculators = pgTable(
  "calculators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Stable key matching the implementation in lib/calculators/. */
    key: varchar("key", { length: 60 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),

    /** Formula version — rate tables live in code and are not editable from the dashboard. */
    version: varchar("version", { length: 30 }).notNull(),
    /**
     * Applicable period for the current rate set — "FY 2026-27" for a tax
     * calculator, a quarter or "N/A" for one that isn't period-sensitive (an
     * EMI calculator's formula doesn't expire with a financial year the way a
     * tax slab does). Nullable for exactly that reason.
     */
    taxYear: varchar("tax_year", { length: 60 }),
    status: calculatorStatus("status").notNull().default("ca_review_required"),

    reviewerName: text("reviewer_name"),
    lastReviewedAt: date("last_reviewed_at"),
    disclaimer: text("disclaimer"),
    sourceNote: text("source_note"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("calculators_client_key_unique").on(t.clientId, t.key)],
);

export const legalPages = pgTable(
  "legal_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    lastReviewedAt: date("last_reviewed_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("legal_pages_client_slug_unique").on(t.clientId, t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    // Unique per client rather than globally, so the same person can hold a
    // dashboard login on more than one tenant (e.g. an agency running both
    // its CA template demo and its real-estate template demo).
    email: varchar("email", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: userRole("role").notNull().default("editor"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("users_client_email_unique").on(t.clientId, t.email)],
);

// ───────────────────────────────────────────────────────── real-estate vertical

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: text("title").notNull(),
    propertyType: varchar("property_type", { length: 40 }).notNull(),
    purpose: propertyPurpose("purpose").notNull().default("buy"),
    status: propertyStatus("status").notNull().default("ready_to_move"),

    price: integer("price"),
    /** Display form — "₹2.15 Cr onwards", "Price on request". */
    priceLabel: text("price_label"),
    pricePerSqft: integer("price_per_sqft"),

    sector: varchar("sector", { length: 40 }),
    locality: varchar("locality", { length: 120 }),
    corridor: varchar("corridor", { length: 120 }),

    beds: integer("beds"),
    baths: integer("baths"),
    area: integer("area"),
    areaUnit: varchar("area_unit", { length: 20 }).default("sqft"),

    /** Free-form highlight — "New Launch", "RERA Registered". */
    badge: text("badge"),
    developer: text("developer"),

    /**
     * RERA registration number — the real-estate analogue of the CA vertical's
     * ICAI firm registration number. A listing without one shows a visible
     * "registration pending" state on the card rather than silently omitting
     * it (see PropertyCard), because the Real Estate (Regulation and
     * Development) Act requires this on any advertisement for a registered
     * project.
     */
    reraNumber: varchar("rera_number", { length: 60 }),

    description: text("description"),
    amenities: jsonb("amenities").$type<string[]>().default([]),
    specs: jsonb("specs").$type<Record<string, string>>().default({}),
    /** A property tour, as a YouTube watch URL. Listing feeds carry these far
     *  more often than they carry usable floor plans, and an embed costs
     *  nothing to host. */
    videoUrl: text("video_url"),

    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("properties_client_slug_unique").on(t.clientId, t.slug)],
);

export const propertyImages = pgTable("property_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  /** Path under public/uploads/{clientId}/{propertyId}/ — never a trusted client filename. */
  path: text("path").notNull(),
  alt: text("alt"),
  isPrimary: boolean("is_primary").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const localities = pgTable(
  "localities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 160 }).notNull(),
    name: text("name").notNull(),
    corridor: varchar("corridor", { length: 120 }),

    avgPricePerSqft: integer("avg_price_per_sqft"),
    // real, not integer: market figures like YoY appreciation and rental yield
    // are conventionally quoted to one decimal place (e.g. 7.2%), and an
    // integer column would silently round every seeded and dashboard-entered
    // value.
    yoyChangePercent: real("yoy_change_percent"),
    rentalYieldPercent: real("rental_yield_percent"),
    activeProjects: integer("active_projects"),
    bestFor: varchar("best_for", { length: 120 }),

    /**
     * Required to have genuinely local content, not a name swap on a template —
     * a locality page with nothing distinguishing it from another is a doorway
     * page and an index-bloat liability. check-content.ts flags any locality
     * whose description is missing, too short, or duplicates another.
     */
    description: text("description"),

    heroImage: text("hero_image"),
    lastVerifiedAt: date("last_verified_at"),
    isPublished: boolean("is_published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("localities_client_slug_unique").on(t.clientId, t.slug)],
);
