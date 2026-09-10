import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { findThinLocalities } from "../lib/content-rules";

/**
 * Reports every client field that is not yet `verified`.
 *
 * This is the pre-delivery checklist: placeholder content is fine while building
 * a mockup, but each item has to be either confirmed with the firm or the
 * corresponding section switched off before the site goes live.
 */

const slug = process.argv[2];
const clientsDir = join(process.cwd(), "clients");

const targets = slug
  ? [slug]
  : readdirSync(clientsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);

if (targets.length === 0) {
  console.log("No client folders found.");
  process.exit(0);
}

let totalPlaceholder = 0;
let totalPending = 0;

for (const target of targets) {
  const dir = join(clientsDir, target);
  console.log(`\n${"─".repeat(64)}\n${target}\n${"─".repeat(64)}`);

  const profilePath = join(dir, "profile.yaml");
  if (!existsSync(profilePath)) {
    console.log("  no profile.yaml");
    continue;
  }

  const profile = parse(readFileSync(profilePath, "utf-8")) as {
    _status?: Record<string, string>;
  };

  const statuses = profile._status ?? {};
  const placeholder: string[] = [];
  const pending: string[] = [];

  for (const [field, status] of Object.entries(statuses)) {
    if (status === "placeholder") placeholder.push(field);
    else if (status === "pending") pending.push(field);
  }

  // Content files carry a single document-level status rather than per-field.
  const contentDir = join(dir, "content");
  const thinLocalities: string[] = [];
  if (existsSync(contentDir)) {
    for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".yaml"))) {
      const doc = parse(readFileSync(join(contentDir, file), "utf-8")) as { _status?: string };
      if (doc?._status === "placeholder") placeholder.push(`content/${file} (whole file)`);
      else if (doc?._status === "pending") pending.push(`content/${file} (whole file)`);
    }

    // Thin-content / doorway-page guard for the real-estate vertical's locality
    // pSEO pages — a locality page with no distinguishing content beyond a name
    // swap is an index-bloat liability (see localities.description in schema.ts).
    const localitiesPath = join(contentDir, "localities.yaml");
    if (existsSync(localitiesPath)) {
      const doc = parse(readFileSync(localitiesPath, "utf-8")) as {
        localities?: { slug: string; description?: string }[];
      };
      // Shared with the dashboard's readiness panel so the two cannot
      // disagree about the same rule — see lib/content-rules.ts.
      for (const t of findThinLocalities(doc.localities ?? [])) {
        thinLocalities.push(`${t.slug} — ${t.reason}`);
      }
    }
  }

  if (thinLocalities.length > 0) {
    console.log(`\n  THIN LOCALITY CONTENT — doorway-page risk (${thinLocalities.length})`);
    for (const f of thinLocalities) console.log(`    · ${f}`);
  }

  if (pending.length > 0) {
    console.log(`\n  PENDING — unknown, currently renders nothing (${pending.length})`);
    for (const f of pending) console.log(`    · ${f}`);
  }

  if (placeholder.length > 0) {
    console.log(`\n  PLACEHOLDER — example content, confirm or switch off (${placeholder.length})`);
    for (const f of placeholder) console.log(`    · ${f}`);
  }

  if (pending.length === 0 && placeholder.length === 0) {
    console.log("\n  All fields verified.");
  }

  totalPlaceholder += placeholder.length;
  totalPending += pending.length;
}

console.log(
  `\n${"─".repeat(64)}\n${totalPlaceholder} placeholder · ${totalPending} pending across ${targets.length} client(s)`,
);
console.log("Nothing here blocks the build — this is the pre-delivery checklist.\n");

/**
 * Clients that exist in the database but have no `clients/<slug>/` folder.
 *
 * This checker walks directories, so before CD-09 such a client produced no
 * output at all and the script still exited 0 — which reads as a clean bill of
 * health for a site that was never checked. CD-03b's wizard makes that the
 * normal case rather than an edge case: a client created from the dashboard has
 * no YAML by design.
 *
 * Reported rather than audited. The `_status` vocabulary is a judgement about
 * whether a claim was confirmed against a named source, and the database does
 * not carry that — so the honest output is "this client is not covered by this
 * check", plus the empty fields that are checkable without inventing provenance.
 * `pnpm export:client <slug>` is what brings one into scope properly.
 */
async function reportDatabaseOnlyClients() {
  const { db } = await import("../lib/db");
  const { clients, firmSettings } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      slug: clients.slug,
      displayName: clients.displayName,
      isActive: clients.isActive,
      settingsId: firmSettings.id,
      phone: firmSettings.phone,
      email: firmSettings.email,
      addressLine: firmSettings.addressLine,
      notificationEmail: firmSettings.notificationEmail,
    })
    .from(clients)
    .leftJoin(firmSettings, eq(firmSettings.clientId, clients.id));

  const orphans = rows.filter((row) => !existsSync(join(clientsDir, row.slug)));
  if (orphans.length === 0) return;

  console.log(`${"─".repeat(64)}`);
  console.log(`NOT COVERED BY THIS CHECK — no clients/<slug>/ folder (${orphans.length})`);
  console.log(`${"─".repeat(64)}\n`);
  for (const row of orphans) {
    console.log(`  ${row.slug}${row.isActive ? "" : "  (inactive)"} — ${row.displayName}`);
    if (!row.settingsId) {
      console.log("    · no firm_settings row at all");
      continue;
    }
    const missing = [
      ["phone", row.phone],
      ["email", row.email],
      ["address", row.addressLine],
      ["notification email (leads have nowhere to go)", row.notificationEmail],
    ]
      .filter(([, value]) => !value)
      .map(([label]) => label);
    if (missing.length > 0) console.log(`    · empty: ${missing.join(", ")}`);
    else console.log("    · core contact fields are filled");
  }
  console.log("\n  Run `pnpm export:client <slug>` to bring one into this checklist.\n");
}

// Only when the database is reachable. A missing DATABASE_URL must not turn the
// YAML checklist — which needs no database — into a failure.
//
// `process.exit` rather than letting the process end on its own: the postgres
// client holds an open pool, so without it the script prints its whole report
// and then hangs forever.
reportDatabaseOnlyClients()
  .catch((error) => {
    console.log(`${"─".repeat(64)}`);
    console.log("Could not check for database-only clients:", (error as Error).message);
    console.log("Any client created from the dashboard is NOT covered by the report above.\n");
  })
  .finally(() => process.exit(0));
