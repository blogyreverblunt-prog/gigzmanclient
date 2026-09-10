import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "yaml";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  clients,
  firmSettings,
  teamMembers,
  services,
  complianceEvents,
  professionalUpdates,
  legalPages,
  calculators,
  users,
  properties,
  propertyImages,
  localities,
} from "../lib/db/schema";
import {
  CALCULATOR_DEFINITIONS,
  REALESTATE_CALCULATOR_DEFINITIONS,
  RATES_VERSION,
  REALESTATE_RATES_VERSION,
  TAX_YEAR,
} from "../lib/calculators/registry";
import { TEMPLATE_REGISTRY } from "../lib/templates";

/**
 * Loads a client folder into the database.
 *
 * Existing rows are updated in place, so re-running is safe. Content the firm has
 * since edited through the dashboard is overwritten only when --force is passed.
 */

const slug = process.argv[2];
const force = process.argv.includes("--force");
const overwriteDashboardEdits = process.argv.includes("--overwrite-dashboard-edits");

if (!slug) {
  console.error("Usage: pnpm seed:client <client-slug> [--force] [--overwrite-dashboard-edits]");
  process.exit(1);
}

const clientDir = join(process.cwd(), "clients", slug);
if (!existsSync(clientDir)) {
  console.error(`No client folder at clients/${slug}`);
  process.exit(1);
}

function readYaml<T>(name: string): T | null {
  const path = join(clientDir, name);
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf-8")) as T;
}

async function main() {
  const profile = readYaml<any>("profile.yaml");
  if (!profile) throw new Error("profile.yaml is required");

  // The template assignment lives on the row since CD-01, and `profile.template`
  // is the bootstrap value for it. Validated against the registry *before*
  // anything is written, because seeding is the documented onboarding path
  // (AGENTS.md "Adding a tenant") and `lib/tenant.ts` 404s a realestate tenant
  // whose value it does not recognise. Without this check a typo — `premiumv2`,
  // a stray trailing space, the wrong case — seeds successfully, exits 0, and
  // leaves a dead site with no diagnostic anywhere.
  //
  // A MISSING template is exactly as fatal as an invalid one for a realestate
  // profile, and it has to be checked here rather than left to look like an
  // omission: `lib/tenant.ts` 404s on a null `template_key` by the same rule it
  // 404s on an unrecognised one, so a realestate profile.yaml with no
  // `template:` key would otherwise seed successfully, exit 0, and produce the
  // same silent dead site this validation exists to prevent.
  //
  // A cafirm profile naming no template stays valid: null is the correct answer
  // for that vertical, not a missing value. Which is why the check is predicated
  // on the vertical rather than on the key simply being present.
  //
  // An empty or whitespace-only value counts as missing. A non-empty one is
  // NOT trimmed before the registry lookup, deliberately: `"premium-v2 "` must
  // still fail as unrecognised rather than be quietly repaired into validity.
  const vertical: string = profile.vertical ?? "cafirm";
  const rawTemplate = profile.template ?? null;
  const templateKey: string | null =
    rawTemplate === null || String(rawTemplate).trim() === "" ? null : rawTemplate;

  const missingForRealestate = vertical === "realestate" && templateKey === null;
  const unrecognised = templateKey !== null && !Object.hasOwn(TEMPLATE_REGISTRY, templateKey);
  if (missingForRealestate || unrecognised) {
    throw new Error(
      (missingForRealestate
        ? `profile.yaml sets vertical: "realestate" but names no template, which is not a `
        : `profile.yaml sets template: ${JSON.stringify(profile.template)}, which is not a `) +
        `template this codebase can render. Valid keys: ${Object.keys(TEMPLATE_REGISTRY).join(", ")}. ` +
        `Nothing was written.`,
    );
  }

  // ------------------------------------------------- dashboard-edit guard
  //
  // `--force` makes every upsert write the YAML values into the update set, so
  // it overwrites anything edited since the last seed. That was safe while the
  // YAML was the only way content got in. It stopped being safe the moment the
  // platform dashboard and the tenant dashboard could both write these rows:
  // a well-meaning `--force` re-seed silently reverts a client's live site to
  // whatever the checked-in file last said.
  //
  // `firm_settings.updated_at` is the marker because both dashboards touch it
  // and the YAML's mtime is what a re-seed would be replaying. Compared before
  // anything is written, so the refusal costs nothing.
  //
  // Deliberately advisory rather than clever: it does not diff field by field.
  // Knowing that the database is newer is enough to make a human look, and a
  // field-level diff would invite trusting it.
  if (force && !overwriteDashboardEdits) {
    const [existingClient] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, profile.slug))
      .limit(1);

    if (existingClient) {
      const [settings] = await db
        .select({ updatedAt: firmSettings.updatedAt })
        .from(firmSettings)
        .where(eq(firmSettings.clientId, existingClient.id))
        .limit(1);

      const yamlMtime = statSync(join(clientDir, "profile.yaml")).mtime;
      if (settings?.updatedAt && settings.updatedAt > yamlMtime) {
        const counts = await Promise.all(
          (
            [
              ["properties", properties],
              ["localities", localities],
              ["services", services],
              ["updates", professionalUpdates],
              ["compliance events", complianceEvents],
              ["legal pages", legalPages],
              ["team members", teamMembers],
            ] as const
          ).map(async ([label, table]) => {
            const rows = await db
              .select({ id: table.id })
              .from(table)
              .where(eq(table.clientId, existingClient.id));
            return `${rows.length} ${label}`;
          }),
        );

        console.error(`\nRefusing to --force ${profile.slug}.`);
        console.error(
          `\n  The database is newer than the YAML:\n` +
            `    firm_settings.updated_at  ${settings.updatedAt.toISOString()}\n` +
            `    profile.yaml modified     ${yamlMtime.toISOString()}\n`,
        );
        console.error(
          `  Something edited this client through a dashboard after the file was\n` +
            `  last written. --force would replay the file over it, affecting:\n` +
            `    ${counts.join("\n    ")}\n`,
        );
        console.error(
          `  If the file really is the version you want, re-run with\n` +
            `    pnpm seed:client ${profile.slug} --force --overwrite-dashboard-edits\n\n` +
            `  To capture the live state into YAML first:\n` +
            `    pnpm export:client ${profile.slug}\n`,
        );
        process.exit(1);
      }
    }
  }

  // ---------------------------------------------------------------- client
  //
  // `clients.features` is deliberately NOT seeded from YAML, and this is the
  // one place a reader is likely to add it by mistake. Two reasons:
  //
  // 1. The name is already taken by something else. `profile.yaml`'s top-level
  //    `features:` block is the FIRM-SETTINGS booleans — reviews, pricing,
  //    awards, client_logos, team — read below as `settingsFeatures` and
  //    written to `firm_settings`. Wiring `features: profile.features` into
  //    the values below would put `{"reviews":true,...}` into
  //    `clients.features`, `featureEnabled()` would find none of its five keys,
  //    and every tenant would silently fall back to the documented defaults
  //    while a `select` showed the column looking populated.
  // 2. Omitting it costs nothing. A tenant seeded without one gets `'{}'`,
  //    which means "every documented default" in `lib/features.ts` — map on,
  //    the three branded/regulated/expensive families off. That is the correct
  //    answer for a new client, and because `features` is absent from the
  //    `onConflictDoUpdate` set block, re-seeding an existing client cannot
  //    null out a live flag.
  //
  // CD-03's platform dashboard owns the write path for these.
  const [client] = await db
    .insert(clients)
    .values({
      slug: profile.slug,
      vertical,
      displayName: profile.display_name,
      isDemo: profile.is_demo ?? false,
      templateKey,
    })
    .onConflictDoUpdate({
      target: clients.slug,
      set: {
        displayName: profile.display_name,
        vertical,
        isDemo: profile.is_demo ?? false,
        // Written only when the YAML actually names one, so re-seeding a client
        // whose profile.yaml predates this field cannot null out a live
        // assignment.
        ...(templateKey ? { templateKey } : {}),
      },
    })
    .returning();

  const clientId = client.id;
  console.log(`client   ${profile.slug} (${clientId})`);

  // --------------------------------------------------------- firm settings
  const contact = profile.contact ?? {};
  const firm = profile.firm ?? {};
  // NOT `clients.features`. `profile.yaml`'s top-level `features:` block is the
  // FIRM-SETTINGS booleans (reviews, pricing, awards, client_logos, team) and
  // goes to `firm_settings` below. Named apart on purpose -- see the comment on
  // the clients upsert above.
  const settingsFeatures = profile.features ?? {};

  const settingsValues = {
    clientId,
    firmName: firm.name ?? profile.display_name,
    tagline: firm.tagline ?? null,
    overview: firm.overview ?? null,
    establishedYear: firm.established_year || null,
    firmRegistrationNumber: firm.firm_registration_number || null,
    businessCategory: firm.business_category ?? null,
    logoUrl: firm.logo_url || null,
    phone: contact.phone || null,
    whatsapp: contact.whatsapp || null,
    email: contact.email || null,
    addressLine: contact.address_line || null,
    locality: contact.locality || null,
    region: contact.region || null,
    postalCode: contact.postal_code || null,
    country: contact.country || "India",
    latitude: contact.latitude || null,
    longitude: contact.longitude || null,
    googleMapsUrl: contact.google_maps_url || null,
    openingHours: profile.opening_hours ?? [],
    socialLinks: profile.social_links ?? {},
    ga4MeasurementId: profile.analytics?.ga4_measurement_id || null,
    searchConsoleVerification: profile.analytics?.search_console_verification || null,
    seoTitle: profile.seo?.title ?? null,
    seoDescription: profile.seo?.description ?? null,
    reviewsEnabled: settingsFeatures.reviews ?? false,
    pricingEnabled: settingsFeatures.pricing ?? true,
    awardsEnabled: settingsFeatures.awards ?? true,
    clientLogosEnabled: settingsFeatures.client_logos ?? true,
    teamEnabled: settingsFeatures.team ?? true,
    notificationEmail: profile.notification_email || null,
    updatedAt: new Date(),
  };

  await db
    .insert(firmSettings)
    .values(settingsValues)
    .onConflictDoUpdate({ target: firmSettings.clientId, set: settingsValues });
  console.log("settings ok");

  // ------------------------------------------------------------------ team
  if (Array.isArray(profile.team) && profile.team.length > 0) {
    const existing = await db.select().from(teamMembers).where(eq(teamMembers.clientId, clientId));
    if (existing.length === 0 || force) {
      if (force) await db.delete(teamMembers).where(eq(teamMembers.clientId, clientId));
      await db.insert(teamMembers).values(
        profile.team.map((m: any, i: number) => ({
          clientId,
          name: m.name,
          designation: m.designation ?? null,
          qualifications: m.qualifications ?? null,
          membershipNumber: m.membership_number || null,
          bio: m.bio ?? null,
          sortOrder: i,
        })),
      );
      console.log(`team     ${profile.team.length}`);
    } else {
      console.log("team     skipped (already present; use --force to replace)");
    }
  }

  // -------------------------------------------------------------- services
  const serviceDoc = readYaml<any>("content/services.yaml");
  if (serviceDoc?.services) {
    for (const [i, s] of serviceDoc.services.entries()) {
      const values = {
        clientId,
        slug: s.slug,
        title: s.title,
        category: s.category,
        summary: s.summary ?? null,
        overview: s.overview ?? null,
        whoNeedsThis: s.who_needs_this ?? [],
        scopeOfAssistance: s.scope_of_assistance ?? [],
        documentsRequired: s.documents_required ?? [],
        engagementProcess: s.engagement_process ?? [],
        timelines: s.timelines ?? null,
        considerations: s.considerations ?? null,
        faqs: s.faqs ?? [],
        isCaExclusive: s.ca_exclusive ?? false,
        sortOrder: i,
        updatedAt: new Date(),
      };
      await db
        .insert(services)
        .values(values)
        .onConflictDoUpdate({
          target: [services.clientId, services.slug],
          set: force ? values : { updatedAt: new Date() },
        });
    }
    console.log(`services ${serviceDoc.services.length}`);
  }

  // ------------------------------------------------------------ compliance
  const complianceDoc = readYaml<any>("content/compliance.yaml");
  if (complianceDoc?.events) {
    const existing = await db
      .select()
      .from(complianceEvents)
      .where(eq(complianceEvents.clientId, clientId));

    if (existing.length === 0 || force) {
      if (force) await db.delete(complianceEvents).where(eq(complianceEvents.clientId, clientId));
      await db.insert(complianceEvents).values(
        complianceDoc.events.map((e: any) => ({
          clientId,
          title: e.title,
          category: e.category,
          description: e.description ?? null,
          applicableTo: e.applicable_to ?? null,
          dueDate: e.due_date,
          extendedDueDate: e.extended_due_date ?? null,
          sourceLabel: e.source_label ?? null,
          sourceUrl: e.source_url ?? null,
          lastVerifiedAt: e.last_verified_at ?? null,
          isRecurring: e.recurring ?? false,
        })),
      );
      console.log(`calendar ${complianceDoc.events.length}`);
    } else {
      console.log("calendar skipped (already present; use --force to replace)");
    }
  }

  // --------------------------------------------------------------- updates
  const updatesDoc = readYaml<any>("content/updates.yaml");
  if (updatesDoc?.updates) {
    for (const u of updatesDoc.updates) {
      const values = {
        clientId,
        slug: u.slug,
        title: u.title,
        category: u.category,
        excerpt: u.excerpt ?? null,
        body: u.body ?? null,
        applicableYear: u.applicable_year ?? null,
        sources: u.sources ?? [],
        status: u.status ?? "draft",
        authorName: u.author_name ?? null,
        reviewerName: u.reviewer_name ?? null,
        publishedAt: u.published_at ? new Date(u.published_at) : null,
        updatedAt: new Date(),
      };
      await db
        .insert(professionalUpdates)
        .values(values)
        .onConflictDoUpdate({
          target: [professionalUpdates.clientId, professionalUpdates.slug],
          set: force ? values : { updatedAt: new Date() },
        });
    }
    console.log(`updates  ${updatesDoc.updates.length}`);
  }

  // ----------------------------------------------------------------- legal
  const legalDoc = readYaml<any>("content/legal.yaml");
  if (legalDoc?.pages) {
    for (const p of legalDoc.pages) {
      const values = {
        clientId,
        slug: p.slug,
        title: p.title,
        body: p.body ?? null,
        updatedAt: new Date(),
      };
      await db
        .insert(legalPages)
        .values(values)
        .onConflictDoUpdate({
          target: [legalPages.clientId, legalPages.slug],
          set: force ? values : { updatedAt: new Date() },
        });
    }
    console.log(`legal    ${legalDoc.pages.length}`);
  }

  // ------------------------------------------------------------ properties
  const propertiesDoc = readYaml<any>("content/properties.yaml");
  if (propertiesDoc?.properties) {
    for (const [i, prop] of propertiesDoc.properties.entries()) {
      const values = {
        clientId,
        slug: prop.slug,
        title: prop.title,
        propertyType: prop.property_type,
        purpose: prop.purpose ?? "buy",
        status: prop.status ?? "ready_to_move",
        price: prop.price ?? null,
        priceLabel: prop.price_label ?? null,
        pricePerSqft: prop.price_per_sqft ?? null,
        sector: prop.sector ? String(prop.sector) : null,
        locality: prop.locality ?? null,
        corridor: prop.corridor ?? null,
        beds: prop.beds ?? null,
        baths: prop.baths ?? null,
        area: prop.area ?? null,
        areaUnit: prop.area_unit ?? "sqft",
        badge: prop.badge ?? null,
        developer: prop.developer ?? null,
        // Deliberately left null for some seed properties — see profile.yaml's
        // _status block. A property with no RERA number renders the visible
        // "Registration pending" state on PropertyCard rather than hiding it.
        reraNumber: prop.rera_number || null,
        videoUrl: prop.video_url || null,
        description: prop.description ?? null,
        amenities: prop.amenities ?? [],
        specs: prop.specs ?? {},
        isFeatured: prop.is_featured ?? false,
        isActive: prop.is_active ?? true,
        sortOrder: i,
        updatedAt: new Date(),
      };

      const [row] = await db
        .insert(properties)
        .values(values)
        .onConflictDoUpdate({
          target: [properties.clientId, properties.slug],
          set: force ? values : { updatedAt: new Date() },
        })
        .returning();

      if (Array.isArray(prop.images) && (force || (await db.select().from(propertyImages).where(eq(propertyImages.propertyId, row.id))).length === 0)) {
        await db.delete(propertyImages).where(eq(propertyImages.propertyId, row.id));
        // A listing can legitimately carry no photography — HRERA-sourced
        // projects only have images where the developer publishes them — and
        // drizzle rejects an empty values() call.
        if (prop.images.length > 0) {
          await db.insert(propertyImages).values(
            prop.images.map((img: any, j: number) => ({
              propertyId: row.id,
              path: img.path,
              alt: img.alt ?? null,
              isPrimary: img.is_primary ?? j === 0,
              sortOrder: j,
            })),
          );
        }
      }
    }
    console.log(`props    ${propertiesDoc.properties.length}`);
  }

  // ------------------------------------------------------------ localities
  const localitiesDoc = readYaml<any>("content/localities.yaml");
  if (localitiesDoc?.localities) {
    for (const [i, loc] of localitiesDoc.localities.entries()) {
      const values = {
        clientId,
        slug: loc.slug,
        name: loc.name,
        corridor: loc.corridor ?? null,
        avgPricePerSqft: loc.avg_price_per_sqft ?? null,
        yoyChangePercent: loc.yoy_change_percent ?? null,
        rentalYieldPercent: loc.rental_yield_percent ?? null,
        activeProjects: loc.active_projects ?? null,
        bestFor: loc.best_for ?? null,
        description: loc.description ?? null,
        heroImage: loc.hero_image ?? null,
        lastVerifiedAt: loc.last_verified_at ?? null,
        isPublished: loc.is_published ?? true,
        sortOrder: i,
        updatedAt: new Date(),
      };
      await db
        .insert(localities)
        .values(values)
        .onConflictDoUpdate({
          target: [localities.clientId, localities.slug],
          set: force ? values : { updatedAt: new Date() },
        });
    }
    console.log(`locales  ${localitiesDoc.localities.length}`);
  }

  // ----------------------------------------------------------- calculators
  //
  // Calculator definitions are vertical-specific (income tax/TDS/GST for a CA
  // practice; EMI/stamp duty/rental yield for real estate), so only the set
  // matching this client's vertical is seeded. A vertical without a registered
  // definition set yet simply seeds none rather than falling back to CA's.
  const calculatorDefs =
    client.vertical === "cafirm"
      ? CALCULATOR_DEFINITIONS
      : client.vertical === "realestate"
        ? REALESTATE_CALCULATOR_DEFINITIONS
        : [];
  // EMI/stamp-duty/rental-yield are not tied to a financial year the way
  // income tax/TDS/GST are (schema.ts documents `calculators.taxYear` as
  // nullable for exactly this reason).
  const calculatorVersion = client.vertical === "cafirm" ? RATES_VERSION : REALESTATE_RATES_VERSION;
  const calculatorTaxYear = client.vertical === "cafirm" ? TAX_YEAR : null;

  for (const def of calculatorDefs) {
    const values = {
      clientId,
      key: def.key,
      title: def.title,
      description: def.description,
      version: calculatorVersion,
      taxYear: calculatorTaxYear,
      disclaimer: def.disclaimer,
      sourceNote: def.sourceNote,
      sortOrder: def.sortOrder,
      updatedAt: new Date(),
    };
    // Status is intentionally excluded from the update set: once a calculator is
    // promoted to active, re-seeding must not silently revert that decision.
    await db
      .insert(calculators)
      .values(values)
      .onConflictDoUpdate({
        target: [calculators.clientId, calculators.key],
        set: { ...values, status: undefined },
      });
  }
  if (calculatorDefs.length > 0) console.log(`calc     ${calculatorDefs.length}`);

  // ------------------------------------------------------------ admin user
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? `admin@${slug}.local`;
  const existingUser = await db
    .select()
    .from(users)
    .where(and(eq(users.clientId, clientId), eq(users.email, adminEmail)))
    .limit(1);

  if (existingUser.length === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await db.insert(users).values({
      clientId,
      email: adminEmail,
      passwordHash: await bcrypt.hash(password, 12),
      name: "Administrator",
      role: "admin",
    });
    console.log("\n  Dashboard sign-in created");
    console.log(`  email     ${adminEmail}`);
    console.log(`  password  ${password}`);
    console.log("  Shown once — store it now, then change it after first sign-in.\n");
  } else {
    console.log("user     already exists");
  }

  console.log(`\nSeeded ${slug}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
