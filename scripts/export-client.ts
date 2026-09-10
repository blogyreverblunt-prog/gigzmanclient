import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { eq, asc } from "drizzle-orm";
import { db } from "../lib/db";
import {
  clients,
  firmSettings,
  teamMembers,
  services,
  complianceEvents,
  professionalUpdates,
  legalPages,
  properties,
  propertyImages,
  localities,
} from "../lib/db/schema";

/**
 * Regenerates `clients/<slug>/` from the database — the reverse of
 * `seed-client.ts`.
 *
 * Since the platform and tenant dashboards write these rows, the database is
 * the source of truth for anything edited through them and the YAML is the
 * bootstrap and audit record. This is what keeps the audit record honest: run
 * it and the checked-in file says what the live site actually says, so
 * `pnpm check:content` reports on reality and `git` carries the history.
 *
 * Two things it deliberately does NOT do:
 *
 * 1. **It never invents a `_status`.** `_status` records a human's judgement
 *    about whether a claim was verified against a named source. The database
 *    cannot know that — a field edited through a dashboard has no provenance
 *    attached — so existing entries are carried across verbatim and no new ones
 *    are fabricated. A field that is now filled but was never audited simply has
 *    no entry, which is the truth. Inventing `verified` here would launder an
 *    unchecked value into an audited one, which is exactly the failure mode
 *    AGENTS.md's "never invent client facts" exists to prevent.
 *
 * 2. **It preserves the file's header comment.** Those headers name the source
 *    the content was confirmed against ("captured via a Hostinger export", the
 *    agency's own schema.org JSON-LD). Regenerating the body must not discard
 *    the provenance of the whole file. `yaml`'s stringify drops comments, so the
 *    header is sliced off the existing file and re-attached.
 */

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: pnpm export:client <client-slug>");
  process.exit(1);
}

const clientDir = join(process.cwd(), "clients", slug);
const contentDir = join(clientDir, "content");

/** The leading comment block of an existing file, or "" if there is none. */
function headerOf(path: string): string {
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  const header: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#") || line.trim() === "") header.push(line);
    else break;
  }
  // Trailing blank lines belong to the separation, not the header.
  while (header.length > 0 && header[header.length - 1].trim() === "") header.pop();
  return header.length > 0 ? `${header.join("\n")}\n\n` : "";
}

function existingDoc(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return (parse(readFileSync(path, "utf-8")) as Record<string, unknown>) ?? {};
}

/**
 * Drop nulls, but KEEP empty strings.
 *
 * A NULL column is a field that was never set; an empty string in these files is
 * usually a field someone deliberately left blank, often with a comment saying
 * why ("Left blank deliberately — do not fill this with an invented number").
 * Collapsing the two would turn a considered decision into an absent key, and
 * the next person to run `seed:client` would see nothing telling them not to
 * fill it in.
 */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>;
}

function write(path: string, header: string, doc: unknown) {
  writeFileSync(path, `${header}${stringify(doc, { lineWidth: 88 })}`, "utf-8");
  console.log(`  wrote ${path.replace(process.cwd(), ".")}`);
}

async function main() {
  const [client] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
  if (!client) {
    console.error(`No client with slug "${slug}" in the database.`);
    process.exit(1);
  }

  mkdirSync(contentDir, { recursive: true });

  const [settings] = await db
    .select()
    .from(firmSettings)
    .where(eq(firmSettings.clientId, client.id))
    .limit(1);

  // ------------------------------------------------------------ profile.yaml
  const profilePath = join(clientDir, "profile.yaml");
  const previous = existingDoc(profilePath);

  const team = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.clientId, client.id))
    .orderBy(asc(teamMembers.sortOrder));

  const profile = {
    slug: client.slug,
    vertical: client.vertical,
    ...(client.templateKey ? { template: client.templateKey } : {}),
    display_name: client.displayName,
    is_demo: client.isDemo,

    firm: compact({
      name: settings?.firmName ?? client.displayName,
      tagline: settings?.tagline,
      overview: settings?.overview,
      established_year: settings?.establishedYear,
      firm_registration_number: settings?.firmRegistrationNumber,
      business_category: settings?.businessCategory,
      logo_url: settings?.logoUrl,
    }),

    contact: compact({
      phone: settings?.phone,
      whatsapp: settings?.whatsapp,
      email: settings?.email,
      address_line: settings?.addressLine,
      locality: settings?.locality,
      region: settings?.region,
      postal_code: settings?.postalCode,
      country: settings?.country,
      latitude: settings?.latitude,
      longitude: settings?.longitude,
      google_maps_url: settings?.googleMapsUrl,
    }),

    opening_hours: settings?.openingHours ?? [],
    social_links: settings?.socialLinks ?? {},

    seo: compact({ title: settings?.seoTitle, description: settings?.seoDescription }),
    analytics: compact({
      ga4_measurement_id: settings?.ga4MeasurementId,
      search_console_verification: settings?.searchConsoleVerification,
    }),

    // The firm-settings booleans. NOT `clients.features` — a different concept
    // with an unfortunately identical name; see the comment on the clients
    // upsert in seed-client.ts.
    features: {
      reviews: settings?.reviewsEnabled ?? false,
      pricing: settings?.pricingEnabled ?? true,
      awards: settings?.awardsEnabled ?? true,
      client_logos: settings?.clientLogosEnabled ?? true,
      team: settings?.teamEnabled ?? true,
    },

    team: team.map((member) =>
      compact({
        name: member.name,
        designation: member.designation,
        qualifications: member.qualifications,
        membership_number: member.membershipNumber,
        bio: member.bio,
        photo_url: member.photoUrl,
      }),
    ),

    notification_email: settings?.notificationEmail ?? "",

    // Carried across verbatim. See the header: the database cannot know whether
    // a field was confirmed against a source, so this is the last human audit,
    // not a statement about the values above.
    ...(previous._status ? { _status: previous._status } : {}),
  };

  write(profilePath, headerOf(profilePath), profile);

  // ----------------------------------------------------------- content files
  const docStatus = (path: string) => {
    const status = existingDoc(path)._status;
    return status ? { _status: status } : {};
  };

  const serviceRows = await db
    .select()
    .from(services)
    .where(eq(services.clientId, client.id))
    .orderBy(asc(services.sortOrder));
  if (serviceRows.length > 0) {
    const path = join(contentDir, "services.yaml");
    write(path, headerOf(path), {
      ...docStatus(path),
      services: serviceRows.map((s) =>
        compact({
          slug: s.slug,
          title: s.title,
          category: s.category,
          summary: s.summary,
          overview: s.overview,
          who_needs_this: s.whoNeedsThis,
          scope_of_assistance: s.scopeOfAssistance,
          documents_required: s.documentsRequired,
          engagement_process: s.engagementProcess,
          timelines: s.timelines,
          considerations: s.considerations,
          faqs: s.faqs,
          is_ca_exclusive: s.isCaExclusive,
        }),
      ),
    });
  }

  const complianceRows = await db
    .select()
    .from(complianceEvents)
    .where(eq(complianceEvents.clientId, client.id))
    .orderBy(asc(complianceEvents.dueDate));
  if (complianceRows.length > 0) {
    const path = join(contentDir, "compliance.yaml");
    write(path, headerOf(path), {
      ...docStatus(path),
      events: complianceRows.map((e) =>
        compact({
          title: e.title,
          category: e.category,
          description: e.description,
          applicable_to: e.applicableTo,
          due_date: e.dueDate,
          extended_due_date: e.extendedDueDate,
          extension_note: e.extensionNote,
          source_label: e.sourceLabel,
          source_url: e.sourceUrl,
          last_verified_at: e.lastVerifiedAt,
          is_recurring: e.isRecurring,
        }),
      ),
    });
  }

  const updateRows = await db
    .select()
    .from(professionalUpdates)
    .where(eq(professionalUpdates.clientId, client.id))
    .orderBy(asc(professionalUpdates.slug));
  if (updateRows.length > 0) {
    const path = join(contentDir, "updates.yaml");
    write(path, headerOf(path), {
      ...docStatus(path),
      updates: updateRows.map((u) =>
        compact({
          slug: u.slug,
          title: u.title,
          category: u.category,
          excerpt: u.excerpt,
          body: u.body,
          applicable_year: u.applicableYear,
          sources: u.sources,
          status: u.status,
          author_name: u.authorName,
          reviewer_name: u.reviewerName,
          seo_title: u.seoTitle,
          seo_description: u.seoDescription,
        }),
      ),
    });
  }

  const legalRows = await db
    .select()
    .from(legalPages)
    .where(eq(legalPages.clientId, client.id))
    .orderBy(asc(legalPages.slug));
  if (legalRows.length > 0) {
    const path = join(contentDir, "legal.yaml");
    write(path, headerOf(path), {
      ...docStatus(path),
      pages: legalRows.map((p) =>
        compact({
          slug: p.slug,
          title: p.title,
          body: p.body,
          last_reviewed_at: p.lastReviewedAt,
        }),
      ),
    });
  }

  const propertyRows = await db
    .select()
    .from(properties)
    .where(eq(properties.clientId, client.id))
    .orderBy(asc(properties.sortOrder));
  if (propertyRows.length > 0) {
    const path = join(contentDir, "properties.yaml");
    const images = await Promise.all(
      propertyRows.map((p) =>
        db
          .select()
          .from(propertyImages)
          .where(eq(propertyImages.propertyId, p.id))
          .orderBy(asc(propertyImages.sortOrder)),
      ),
    );
    write(path, headerOf(path), {
      ...docStatus(path),
      properties: propertyRows.map((p, i) =>
        compact({
          slug: p.slug,
          title: p.title,
          property_type: p.propertyType,
          purpose: p.purpose,
          status: p.status,
          price: p.price,
          price_label: p.priceLabel,
          price_per_sqft: p.pricePerSqft,
          sector: p.sector,
          locality: p.locality,
          corridor: p.corridor,
          beds: p.beds,
          baths: p.baths,
          area: p.area,
          area_unit: p.areaUnit,
          badge: p.badge,
          developer: p.developer,
          // Exported as-is including when absent: a listing without a RERA
          // number must keep showing its "registration pending" state rather
          // than have the field quietly filled on the way through.
          rera_number: p.reraNumber,
          description: p.description,
          amenities: p.amenities,
          specs: p.specs,
          video_url: p.videoUrl,
          is_featured: p.isFeatured,
          images: images[i].map((img) => compact({ path: img.path, alt: img.alt })),
        }),
      ),
    });
  }

  const localityRows = await db
    .select()
    .from(localities)
    .where(eq(localities.clientId, client.id))
    .orderBy(asc(localities.sortOrder));
  if (localityRows.length > 0) {
    const path = join(contentDir, "localities.yaml");
    write(path, headerOf(path), {
      ...docStatus(path),
      localities: localityRows.map((l) =>
        compact({
          slug: l.slug,
          name: l.name,
          corridor: l.corridor,
          avg_price_per_sqft: l.avgPricePerSqft,
          yoy_change_percent: l.yoyChangePercent,
          rental_yield_percent: l.rentalYieldPercent,
          active_projects: l.activeProjects,
          best_for: l.bestFor,
          description: l.description,
          hero_image: l.heroImage,
          last_verified_at: l.lastVerifiedAt,
        }),
      ),
    });
  }

  console.log(`\nExported ${slug} from the database.`);
  console.log("  · `_status` entries are the last human audit and were NOT regenerated.");
  console.log("  · The file header is preserved. INLINE comments inside the body are NOT —");
  console.log("    `yaml` cannot round-trip them. Some of those comments say why a field was");
  console.log("    deliberately left blank, so read `git diff` before committing and restore");
  console.log("    any reasoning worth keeping.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
