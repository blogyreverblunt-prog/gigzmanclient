/**
 * CD-03a evidence harness: submit the Business details panel for a client with
 * its CURRENT stored values, applying only the overrides given on the command
 * line — i.e. exactly what the form posts when an operator changes one field.
 *
 * Usage: node business-save.mjs <slug> <actionId> <cookie> [field=value ...]
 */
import postgres from "postgres";
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/client.node.js";

const [, , slug, actionId, cookie, ...overrides] = process.argv;
const BASE = process.env.EVIDENCE_BASE ?? "http://localhost:3456";

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [row] = await sql`
  SELECT f.* FROM firm_settings f JOIN clients c ON c.id = f.client_id WHERE c.slug = ${slug}`;
await sql.end();
if (!row) throw new Error(`no firm_settings for ${slug}`);

const fd = new FormData();
const put = (k, v) => fd.append(k, v ?? "");
put("clientId", row.client_id);
put("firmName", row.firm_name);
put("tagline", row.tagline);
put("overview", row.overview);
put("establishedYear", row.established_year);
put("firmRegistrationNumber", row.firm_registration_number);
put("businessCategory", row.business_category);
put("phone", row.phone);
put("whatsapp", row.whatsapp);
put("email", row.email);
put("notificationEmail", row.notification_email);
put("addressLine", row.address_line);
put("locality", row.locality);
put("region", row.region);
put("postalCode", row.postal_code);
put("country", row.country);
put("latitude", row.latitude);
put("longitude", row.longitude);
put("googleMapsUrl", row.google_maps_url);

for (const hour of row.opening_hours ?? []) {
  if (hour.closed) fd.append(`hours-${hour.day}-closed`, "on");
  else {
    put(`hours-${hour.day}-opens`, hour.opens);
    put(`hours-${hour.day}-closes`, hour.closes);
  }
}
for (const key of ["instagram", "facebook", "linkedin", "youtube"]) {
  put(`social-${key}`, (row.social_links ?? {})[key]);
}
for (const [column, field] of [
  ["reviews_enabled", "reviewsEnabled"],
  ["pricing_enabled", "pricingEnabled"],
  ["awards_enabled", "awardsEnabled"],
  ["client_logos_enabled", "clientLogosEnabled"],
  ["team_enabled", "teamEnabled"],
]) {
  if (row[column]) fd.append(field, "on");
}

for (const pair of overrides) {
  const i = pair.indexOf("=");
  const k = pair.slice(0, i);
  const v = pair.slice(i + 1);
  fd.delete(k);
  if (v !== "") fd.append(k, v);
}

const body = await encodeReply([fd]);
const headers = { "Next-Action": actionId, Cookie: cookie };
if (typeof body === "string") headers["Content-Type"] = "text/plain;charset=UTF-8";
const res = await fetch(`${BASE}/clients/${slug}`, {
  method: "POST",
  headers,
  body,
  redirect: "manual",
});
const text = await res.text();
console.log("STATUS", res.status, "X-ACTION-REDIRECT", res.headers.get("x-action-redirect") ?? "-");
const results = text.match(/\{"ok":(?:true|false)(?:,"message":"(?:[^"\\]|\\.)*")?\}/g);
console.log(results ? results.join("\n") : "(no ActionResult in the response)");
