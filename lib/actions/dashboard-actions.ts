"use server";

import { revalidatePath, updateTag } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  queries,
  queryStatusHistory,
  queryNotes,
  professionalUpdates,
  complianceEvents,
  calculators,
  firmSettings,
  services,
  properties,
  propertyImages,
  localities,
} from "@/lib/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth";
import { putObject, deleteObject } from "@/lib/storage";
import { tenantDataTag } from "@/lib/cache-tags";
import { SITEMAP_FAMILIES } from "@/lib/sitemap";
import { slugify } from "@/lib/format";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * Every action re-checks authentication and tenant ownership. A Server Action is
 * a reachable POST endpoint, so the dashboard layout having rendered proves
 * nothing about the caller.
 */
async function assertOwnership<T extends { clientId: string }>(
  row: T | undefined,
  clientId: string,
): Promise<T> {
  if (!row || row.clientId !== clientId) throw new Error("Record not found");
  return row;
}

function fail(error: unknown): ActionResult {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return { ok: false, message };
}

/**
 * Expire this tenant's cached public pages.
 *
 * Until CD-03c every action here ended in `revalidatePath("/site/properties")`
 * or `revalidatePath("/site")`, and **none of them did anything**. Next turns
 * the argument into the single implicit tag `_N_T_<path>`, while a rendered
 * entry carries tags derived from its ROUTE PATTERN — `_N_T_/site/[tenant]/
 * (public)/properties/page` — plus its resolved pathname,
 * `_N_T_/site/high-properties/properties`. `_N_T_/site/properties` is neither,
 * so it matched nothing. No warning was emitted either: the missing-`type`
 * warning only fires when the path contains a dynamic segment, and these did
 * not. The dashboard said "Saved." and the public page kept serving the old
 * copy until the 300-second window expired on its own.
 *
 * `tenantDataTag` works because it is attached to real cached entries:
 * `cachedForClient` in lib/content.ts tags every cross-request entry with it,
 * and `unstable_cache` pushes its tags onto the enclosing render, so every page
 * under app/site/[tenant]/(public)/ inherits it through the layout's
 * `getFirmSettings` call. Expiring it re-renders this tenant's pages — which
 * also picks up the per-request `cache()` reads (properties, services, updates)
 * that have no cross-request entry of their own to expire.
 *
 * Scoped to one tenant on purpose. A coarse tag would expire all six on any
 * edit, and the cross-region round trip that caching exists to avoid
 * (functions in bom1, pooler in ap-southeast-2) is not optional polish.
 *
 * `updateTag`, not `revalidateTag`: the single-argument form is deprecated in
 * Next 16.3.3, and `revalidateTag(tag, "max")` serves the stale copy for up to
 * a year while revalidating behind the request — wrong for someone who just
 * pressed Save and is about to check the site.
 */
function invalidateTenantContent(clientId: string) {
  updateTag(tenantDataTag(clientId));
}

/**
 * The sitemaps are route handlers that read `clients` and the content tables
 * directly, so they carry none of the tenant tags. They are addressed by
 * literal pathname, which is the one `revalidatePath` form that does match: a
 * rendered entry carries its resolved pathname as exactly that implicit tag.
 */
function invalidateSitemaps() {
  revalidatePath("/sitemap.xml");
  for (const family of SITEMAP_FAMILIES) revalidatePath(`/sitemaps/${family.id}.xml`);
}

// ─────────────────────────────────────────────────────────────── queries

export async function updateQueryStatus(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));
    const toStatus = String(formData.get("status")) as typeof queries.$inferSelect.status;
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const notConvertedReason = String(formData.get("notConvertedReason") ?? "").trim();

    const [existing] = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    if (toStatus === "not_converted" && !notConvertedReason) {
      return { ok: false, message: "Select a reason before marking a query not converted." };
    }

    await db
      .update(queries)
      .set({
        status: toStatus,
        notConvertedReason:
          toStatus === "not_converted"
            ? (notConvertedReason as typeof queries.$inferSelect.notConvertedReason)
            : null,
        lastActivityAt: new Date(),
      })
      .where(eq(queries.id, id));

    await db.insert(queryStatusHistory).values({
      queryId: id,
      fromStatus: existing.status,
      toStatus,
      reason,
      changedBy: user.name ?? user.email,
    });

    // No invalidation: the dashboard tree is dynamically rendered (every page
    // reads cookies through getSessionUser), and a lead changes no public page.
    return { ok: true, message: "Status updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function updateQueryDetails(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [existing] = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    const followUpDate = String(formData.get("followUpDate") ?? "").trim();
    const assignedTo = String(formData.get("assignedTo") ?? "").trim();
    const priority = String(formData.get("priority") ?? "normal").trim();

    await db
      .update(queries)
      .set({
        followUpDate: followUpDate || null,
        assignedTo: assignedTo || null,
        priority,
        lastActivityAt: new Date(),
      })
      .where(eq(queries.id, id));

    // No invalidation: the dashboard tree is dynamically rendered (every page
    // reads cookies through getSessionUser), and a lead changes no public page.
    return { ok: true, message: "Query updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function addQueryNote(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return { ok: false, message: "Enter a note before saving." };

    const [existing] = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    await db.insert(queryNotes).values({
      queryId: id,
      body,
      authorName: user.name ?? user.email,
    });

    await db.update(queries).set({ lastActivityAt: new Date() }).where(eq(queries.id, id));

    // No invalidation: the dashboard tree is dynamically rendered (every page
    // reads cookies through getSessionUser), and a lead changes no public page.
    return { ok: true, message: "Note added." };
  } catch (error) {
    return fail(error);
  }
}

export async function archiveQuery(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [existing] = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    // Archived rather than deleted so the enquiry history stays auditable.
    await db
      .update(queries)
      .set({ isArchived: !existing.isArchived, lastActivityAt: new Date() })
      .where(eq(queries.id, id));

    // No invalidation: the dashboard tree is dynamically rendered (every page
    // reads cookies through getSessionUser), and a lead changes no public page.
    return { ok: true, message: existing.isArchived ? "Query restored." : "Query archived." };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────── updates

export async function saveUpdate(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "").trim();

    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const status = String(formData.get("status") ?? "draft") as
      typeof professionalUpdates.$inferSelect.status;
    const applicableYear = String(formData.get("applicableYear") ?? "").trim();
    const reviewerName = String(formData.get("reviewerName") ?? "").trim();
    const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
    const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();

    if (!title) return { ok: false, message: "A title is required." };
    if (!category) return { ok: false, message: "A category is required." };

    // Publishing requires the provenance fields the editorial rules mandate.
    if (status === "published") {
      if (!reviewerName) {
        return { ok: false, message: "A reviewer is required before publishing." };
      }
      if (!sourceUrl) {
        return { ok: false, message: "A source reference is required before publishing." };
      }
      if (!applicableYear) {
        return { ok: false, message: "An applicable period is required before publishing." };
      }
    }

    const values = {
      title,
      category,
      status,
      excerpt: String(formData.get("excerpt") ?? "").trim() || null,
      body: String(formData.get("body") ?? "") || null,
      applicableYear: applicableYear || null,
      authorName: String(formData.get("authorName") ?? "").trim() || null,
      reviewerName: reviewerName || null,
      sources: sourceUrl ? [{ label: sourceLabel || "Source", url: sourceUrl }] : [],
      publishedAt: status === "published" ? new Date() : null,
      updatedAt: new Date(),
    };

    if (id) {
      const [existing] = await db
        .select()
        .from(professionalUpdates)
        .where(eq(professionalUpdates.id, id))
        .limit(1);
      await assertOwnership(existing, user.clientId);

      await db
        .update(professionalUpdates)
        .set({
          ...values,
          // Keep the original publication date once it has been set.
          publishedAt: existing.publishedAt ?? values.publishedAt,
        })
        .where(eq(professionalUpdates.id, id));
    } else {
      await db.insert(professionalUpdates).values({
        ...values,
        clientId: user.clientId,
        slug: slugify(title),
      });
    }

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Update saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteUpdate(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const id = String(formData.get("id"));

    const [existing] = await db
      .select()
      .from(professionalUpdates)
      .where(eq(professionalUpdates.id, id))
      .limit(1);
    await assertOwnership(existing, user.clientId);

    await db
      .update(professionalUpdates)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(professionalUpdates.id, id));

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Update archived." };
  } catch (error) {
    return fail(error);
  }
}

// ────────────────────────────────────────────────────────────── compliance

export async function saveComplianceEvent(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "").trim();

    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();

    if (!title || !category || !dueDate) {
      return { ok: false, message: "Title, category and due date are required." };
    }

    const extendedDueDate = String(formData.get("extendedDueDate") ?? "").trim();

    const values = {
      title,
      category,
      description: String(formData.get("description") ?? "").trim() || null,
      applicableTo: String(formData.get("applicableTo") ?? "").trim() || null,
      // The original statutory date is never overwritten by an extension.
      dueDate,
      extendedDueDate: extendedDueDate || null,
      extensionNote: String(formData.get("extensionNote") ?? "").trim() || null,
      sourceLabel: String(formData.get("sourceLabel") ?? "").trim() || null,
      sourceUrl: String(formData.get("sourceUrl") ?? "").trim() || null,
      lastVerifiedAt: String(formData.get("lastVerifiedAt") ?? "").trim() || null,
      isPublished: formData.get("isPublished") === "on",
    };

    if (id) {
      const [existing] = await db
        .select()
        .from(complianceEvents)
        .where(eq(complianceEvents.id, id))
        .limit(1);
      await assertOwnership(existing, user.clientId);
      await db.update(complianceEvents).set(values).where(eq(complianceEvents.id, id));
    } else {
      await db.insert(complianceEvents).values({ ...values, clientId: user.clientId });
    }

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Compliance date saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteComplianceEvent(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [existing] = await db
      .select()
      .from(complianceEvents)
      .where(eq(complianceEvents.id, id))
      .limit(1);
    await assertOwnership(existing, user.clientId);

    await db.delete(complianceEvents).where(eq(complianceEvents.id, id));

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Compliance date removed." };
  } catch (error) {
    return fail(error);
  }
}

// ───────────────────────────────────────────────────────────── calculators

export async function updateCalculator(formData: FormData): Promise<ActionResult> {
  try {
    // Promoting a calculator to active asserts the rates have been professionally
    // verified, so it is restricted to administrators.
    const user = await requireAdmin();
    const id = String(formData.get("id"));
    const status = String(formData.get("status")) as typeof calculators.$inferSelect.status;
    const reviewerName = String(formData.get("reviewerName") ?? "").trim();

    const [existing] = await db.select().from(calculators).where(eq(calculators.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    if (status === "active" && !reviewerName) {
      return {
        ok: false,
        message: "Record who verified the rates before marking a calculator active.",
      };
    }

    await db
      .update(calculators)
      .set({
        status,
        reviewerName: reviewerName || null,
        disclaimer: String(formData.get("disclaimer") ?? "").trim() || existing.disclaimer,
        lastReviewedAt:
          status === "active" ? new Date().toISOString().slice(0, 10) : existing.lastReviewedAt,
        updatedAt: new Date(),
      })
      .where(eq(calculators.id, id));

    invalidateTenantContent(user.clientId);
    return { ok: true, message: "Calculator updated." };
  } catch (error) {
    return fail(error);
  }
}

// ──────────────────────────────────────────────────────────────── settings

export async function updateFirmSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();

    const firmName = String(formData.get("firmName") ?? "").trim();
    if (!firmName) return { ok: false, message: "The firm name is required." };

    await db
      .update(firmSettings)
      .set({
        firmName,
        tagline: String(formData.get("tagline") ?? "").trim() || null,
        overview: String(formData.get("overview") ?? "").trim() || null,
        establishedYear: String(formData.get("establishedYear") ?? "").trim() || null,
        firmRegistrationNumber:
          String(formData.get("firmRegistrationNumber") ?? "").trim() || null,
        businessCategory: String(formData.get("businessCategory") ?? "").trim() || null,
        logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
        phone: String(formData.get("phone") ?? "").trim() || null,
        whatsapp: String(formData.get("whatsapp") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim() || null,
        addressLine: String(formData.get("addressLine") ?? "").trim() || null,
        locality: String(formData.get("locality") ?? "").trim() || null,
        region: String(formData.get("region") ?? "").trim() || null,
        postalCode: String(formData.get("postalCode") ?? "").trim() || null,
        latitude: String(formData.get("latitude") ?? "").trim() || null,
        longitude: String(formData.get("longitude") ?? "").trim() || null,
        googleMapsUrl: String(formData.get("googleMapsUrl") ?? "").trim() || null,
        seoTitle: String(formData.get("seoTitle") ?? "").trim() || null,
        seoDescription: String(formData.get("seoDescription") ?? "").trim() || null,
        ga4MeasurementId: String(formData.get("ga4MeasurementId") ?? "").trim() || null,
        notificationEmail: String(formData.get("notificationEmail") ?? "").trim() || null,
        reviewsEnabled: formData.get("reviewsEnabled") === "on",
        pricingEnabled: formData.get("pricingEnabled") === "on",
        awardsEnabled: formData.get("awardsEnabled") === "on",
        clientLogosEnabled: formData.get("clientLogosEnabled") === "on",
        teamEnabled: formData.get("teamEnabled") === "on",
        updatedAt: new Date(),
      })
      .where(eq(firmSettings.clientId, user.clientId));

    invalidateTenantContent(user.clientId);
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleService(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [existing] = await db.select().from(services).where(eq(services.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    await db
      .update(services)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(and(eq(services.id, id), eq(services.clientId, user.clientId)));

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: existing.isActive ? "Service hidden." : "Service published." };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────── properties

export async function saveProperty(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "").trim();

    const title = String(formData.get("title") ?? "").trim();
    const propertyType = String(formData.get("propertyType") ?? "").trim();
    if (!title) return { ok: false, message: "A title is required." };
    if (!propertyType) return { ok: false, message: "A property type is required." };

    const num = (key: string) => {
      const raw = String(formData.get(key) ?? "").replace(/[^\d.]/g, "");
      return raw ? Number(raw) : null;
    };
    const str = (key: string) => String(formData.get(key) ?? "").trim() || null;

    const amenities = String(formData.get("amenities") ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const values = {
      title,
      propertyType,
      purpose: String(formData.get("purpose") ?? "buy") as typeof properties.$inferSelect.purpose,
      status: String(formData.get("status") ?? "ready_to_move") as
        typeof properties.$inferSelect.status,
      price: num("price"),
      priceLabel: str("priceLabel"),
      pricePerSqft: num("pricePerSqft"),
      sector: str("sector"),
      locality: str("locality"),
      corridor: str("corridor"),
      beds: num("beds"),
      baths: num("baths"),
      area: num("area"),
      areaUnit: str("areaUnit") ?? "sqft",
      badge: str("badge"),
      developer: str("developer"),
      // Left empty by the agent when registration is genuinely pending — see
      // PropertyCard's "Registration pending" state. Never auto-filled.
      reraNumber: str("reraNumber"),
      description: str("description"),
      amenities,
      isFeatured: formData.get("isFeatured") === "on",
      updatedAt: new Date(),
    };

    if (id) {
      const [existing] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
      await assertOwnership(existing, user.clientId);
      await db.update(properties).set(values).where(eq(properties.id, id));
    } else {
      await db.insert(properties).values({
        ...values,
        clientId: user.clientId,
        slug: slugify(title),
        isActive: true,
      });
    }

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Property saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleProperty(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [existing] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    await db
      .update(properties)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(properties.id, id));

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: existing.isActive ? "Property hidden." : "Property published." };
  } catch (error) {
    return fail(error);
  }
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Writes to `public/uploads/{clientId}/{propertyId}/` per the plan — local
 * disk, no external API. Filenames are randomised rather than trusting the
 * uploaded name; type and size are validated server-side regardless of what
 * the browser's `accept` attribute suggested.
 *
 * Vercel's filesystem is ephemeral, so this is correct for local development
 * and the demo library but not a production deployment target as-is — the
 * swap to object storage (e.g. Vercel Blob) is a later, isolated change
 * behind this same action's signature.
 */
export async function uploadPropertyImage(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const propertyId = String(formData.get("propertyId") ?? "").trim();
    const alt = String(formData.get("alt") ?? "").trim() || null;
    const file = formData.get("file");

    const [existing] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    await assertOwnership(existing, user.clientId);

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose an image file to upload." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Image must be 5MB or smaller." };
    }
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) {
      return { ok: false, message: "Only JPEG, PNG or WebP images are accepted." };
    }

    // Storage goes through the seam rather than straight to disk: the local
    // backend is this same public/uploads write, and a production deployment
    // with BLOB_READ_WRITE_TOKEN set stores durably instead. Vercel’s
    // filesystem is ephemeral, so the disk write alone uploads successfully
    // and 404s after the next deploy.
    const filename = `${randomBytes(16).toString("hex")}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicPath = await putObject(
      `${user.clientId}/${propertyId}/${filename}`,
      buffer,
      file.type,
    );

    const existingImages = await db
      .select()
      .from(propertyImages)
      .where(eq(propertyImages.propertyId, propertyId));

    await db.insert(propertyImages).values({
      propertyId,
      path: publicPath,
      alt,
      isPrimary: existingImages.length === 0,
      sortOrder: existingImages.length,
    });

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Image uploaded." };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePropertyImage(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [image] = await db.select().from(propertyImages).where(eq(propertyImages.id, id)).limit(1);
    if (!image) return { ok: false, message: "Image not found." };

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, image.propertyId))
      .limit(1);
    await assertOwnership(property, user.clientId);

    await db.delete(propertyImages).where(eq(propertyImages.id, id));

    // Best-effort — a missing file on disk (e.g. after a redeploy on an
    // ephemeral filesystem) should not block removing the database row.
    try {
      await deleteObject(image.path);
    } catch {
      // ignore
    }

    if (image.isPrimary) {
      const [next] = await db
        .select()
        .from(propertyImages)
        .where(eq(propertyImages.propertyId, image.propertyId))
        .orderBy(asc(propertyImages.sortOrder))
        .limit(1);
      if (next) {
        await db.update(propertyImages).set({ isPrimary: true }).where(eq(propertyImages.id, next.id));
      }
    }

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Image removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function setPrimaryPropertyImage(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [image] = await db.select().from(propertyImages).where(eq(propertyImages.id, id)).limit(1);
    if (!image) return { ok: false, message: "Image not found." };

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, image.propertyId))
      .limit(1);
    await assertOwnership(property, user.clientId);

    await db
      .update(propertyImages)
      .set({ isPrimary: false })
      .where(eq(propertyImages.propertyId, image.propertyId));
    await db.update(propertyImages).set({ isPrimary: true }).where(eq(propertyImages.id, id));

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Cover photo updated." };
  } catch (error) {
    return fail(error);
  }
}

// ─────────────────────────────────────────────────────────────── localities

export async function saveLocality(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "").trim();

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!name) return { ok: false, message: "A name is required." };

    const isPublished = formData.get("isPublished") === "on";
    // The same doorway-page concern check-content.ts flags for seed content
    // applies to anything entered here — a locality page needs genuinely
    // distinguishing content before it goes live.
    if (isPublished && description.length < 120) {
      return {
        ok: false,
        message: "Add at least 120 characters of description before publishing this locality.",
      };
    }

    const num = (key: string) => {
      const raw = String(formData.get(key) ?? "").replace(/[^\d.]/g, "");
      return raw ? Number(raw) : null;
    };
    const str = (key: string) => String(formData.get(key) ?? "").trim() || null;

    const values = {
      name,
      corridor: str("corridor"),
      avgPricePerSqft: num("avgPricePerSqft"),
      yoyChangePercent: num("yoyChangePercent"),
      rentalYieldPercent: num("rentalYieldPercent"),
      activeProjects: num("activeProjects"),
      bestFor: str("bestFor"),
      description: description || null,
      heroImage: str("heroImage"),
      isPublished,
      updatedAt: new Date(),
    };

    if (id) {
      const [existing] = await db.select().from(localities).where(eq(localities.id, id)).limit(1);
      await assertOwnership(existing, user.clientId);
      await db.update(localities).set(values).where(eq(localities.id, id));
    } else {
      await db.insert(localities).values({ ...values, clientId: user.clientId, slug: slugify(name) });
    }

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: "Locality saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleLocality(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));

    const [existing] = await db.select().from(localities).where(eq(localities.id, id)).limit(1);
    await assertOwnership(existing, user.clientId);

    await db
      .update(localities)
      .set({ isPublished: !existing.isPublished, updatedAt: new Date() })
      .where(eq(localities.id, id));

    invalidateTenantContent(user.clientId);
    invalidateSitemaps();
    return { ok: true, message: existing.isPublished ? "Locality hidden." : "Locality published." };
  } catch (error) {
    return fail(error);
  }
}
