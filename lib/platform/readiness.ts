import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, firmSettings, localities, properties, services } from "@/lib/db/schema";
import { findThinLocalities } from "@/lib/content-rules";
import { generatedHomeMeta, TITLE_LIMIT, DESCRIPTION_LIMIT } from "@/lib/seo/generated";

/**
 * What is still missing before this client's site can be handed over.
 *
 * This is what replaces an "SEO" form. A non-technical operator cannot write
 * metadata for thousands of generated pages, and asking them to produces either
 * blank fields or one description pasted everywhere. What they *can* act on is
 * a list of things that are missing — and every item here is a field somewhere
 * else on this page, not a new thing to compose.
 *
 * Rules that also exist in `pnpm check:content` come from `lib/content-rules.ts`
 * rather than being restated, because two implementations of the same rule
 * eventually disagree and the operator would be trusting the wrong one.
 *
 * What this deliberately does NOT do is grade content quality. It reports
 * absence, which is checkable. Whether a description is any good is not.
 */

export type ReadinessStatus = "ok" | "warn" | "missing";

export interface ReadinessItem {
  label: string;
  status: ReadinessStatus;
  detail?: string;
  /** Which panel on this page fixes it. */
  fix?: string;
}

export interface ReadinessGroup {
  title: string;
  items: ReadinessItem[];
}

export async function clientReadiness(clientId: string): Promise<ReadinessGroup[]> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return [];

  const [settings] = await db
    .select()
    .from(firmSettings)
    .where(eq(firmSettings.clientId, clientId))
    .limit(1);

  const [localityRows, propertyRows, serviceRows] = await Promise.all([
    db.select().from(localities).where(eq(localities.clientId, clientId)),
    db.select({ id: properties.id }).from(properties).where(eq(properties.clientId, clientId)),
    db.select({ title: services.title }).from(services).where(eq(services.clientId, clientId)),
  ]);

  const present = (value: unknown, label: string, fix: string): ReadinessItem => ({
    label,
    status: value ? "ok" : "missing",
    fix: value ? undefined : fix,
  });

  const meta = generatedHomeMeta(settings ?? null, client.vertical, {
    localities: localityRows.map((l) => l.name),
    serviceTitles: serviceRows.map((s) => s.title),
  });

  const hours = Array.isArray(settings?.openingHours) ? settings.openingHours : [];
  const socials = settings?.socialLinks ?? {};

  const groups: ReadinessGroup[] = [
    {
      title: "The business",
      items: [
        present(settings?.firmName, "Business name", "Business details"),
        present(settings?.phone, "Phone number", "Business details"),
        present(settings?.addressLine, "Street address", "Business details"),
        present(settings?.locality, "Town or city", "Business details"),
        // Called out separately from the other contact fields because the
        // failure is silent: the enquiry form works, the lead is stored, and
        // nobody is told about it.
        {
          label: "Notification email",
          status: settings?.notificationEmail ? "ok" : "missing",
          detail: settings?.notificationEmail
            ? undefined
            : "Enquiries are saved but nobody is emailed about them.",
          fix: settings?.notificationEmail ? undefined : "Business details",
        },
        {
          label: "Opening hours",
          status: hours.some((h) => !h.closed) ? "ok" : "warn",
          detail: hours.some((h) => !h.closed)
            ? undefined
            : "No open days set, so the hours block and the structured data are omitted.",
          fix: "Business details",
        },
        {
          label: "Social links",
          status: Object.values(socials).some(Boolean) ? "ok" : "warn",
          detail: Object.values(socials).some(Boolean) ? undefined : "None set — the footer omits them.",
          fix: "Business details",
        },
      ],
    },
    {
      title: "Branding",
      items: [
        present(settings?.logoUrl, "Logo", "Logo and brand assets"),
        {
          label: "Favicon set",
          status: settings?.iconBaseUrl ? "ok" : "warn",
          detail: settings?.iconBaseUrl
            ? undefined
            : "Falls back to the app default. Uploading a logo generates one.",
          fix: "Logo and brand assets",
        },
        {
          label: "Share image",
          status: settings?.ogImageUrl ? "ok" : "warn",
          detail: settings?.ogImageUrl
            ? undefined
            : "A card is composed from the logo and settings, which is usually fine.",
          fix: "Logo and brand assets",
        },
      ],
    },
    {
      title: "Search and analytics",
      items: [
        {
          label: "Homepage title",
          status: meta.title ? (meta.title.length > TITLE_LIMIT ? "warn" : "ok") : "missing",
          detail: meta.title
            ? meta.title.length > TITLE_LIMIT
              ? `${meta.title.length} characters — Google will cut it off around ${TITLE_LIMIT}.`
              : undefined
            : "Nothing to generate one from — the business name is empty.",
          fix: "Search appearance",
        },
        {
          label: "Homepage description",
          status: meta.description
            ? meta.description.length > DESCRIPTION_LIMIT
              ? "warn"
              : "ok"
            : "missing",
          detail: meta.description
            ? undefined
            : "Add an overview in Business details, or write one here.",
          fix: "Search appearance",
        },
        {
          label: "Google Analytics",
          status: settings?.ga4MeasurementId ? "ok" : "warn",
          detail: settings?.ga4MeasurementId ? undefined : "No visitor numbers are being collected.",
          fix: "Search appearance",
        },
        {
          label: "Search Console verified",
          status: settings?.searchConsoleVerification ? "ok" : "warn",
          detail: settings?.searchConsoleVerification
            ? undefined
            : "Google cannot report this site's search performance to you.",
          fix: "Search appearance",
        },
        {
          label: "Custom domain",
          status: client.customDomain ? "ok" : "warn",
          detail: client.customDomain
            ? undefined
            : "The site runs on the shared address. DNS still has to be pointed by hand.",
          fix: "Identity and routing",
        },
      ],
    },
  ];

  if (client.vertical === "realestate") {
    const thin = findThinLocalities(localityRows);
    groups.push({
      title: "Content",
      items: [
        {
          label: "Properties",
          status: propertyRows.length > 0 ? "ok" : "missing",
          detail: propertyRows.length > 0 ? `${propertyRows.length} listed` : "None listed yet.",
        },
        {
          label: "Locality pages",
          status: localityRows.length === 0 ? "missing" : thin.length > 0 ? "warn" : "ok",
          detail:
            localityRows.length === 0
              ? "None yet."
              : thin.length > 0
                ? // The doorway-page rule. Named as a risk rather than a style
                  // note because these pages are indexable and thin ones drag
                  // the whole site down, not just themselves.
                  `${thin.length} of ${localityRows.length} are too short or duplicate another: ${thin
                    .slice(0, 3)
                    .map((t) => t.slug)
                    .join(", ")}${thin.length > 3 ? "…" : ""}`
                : `${localityRows.length} pages, all with their own description`,
        },
      ],
    });
  }

  return groups;
}
