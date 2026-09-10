/**
 * Findings 1+2 evidence: with `features.homeLoan` set directly in SQL on a
 * `cafirm` row, show that the FLAG really is on — so that the 404 observed at
 * the same moment is the new vertical/template gate doing its job, not the flag
 * failing to be set.
 */
import postgres from "postgres";
import { homeLoanEnabled } from "../../lib/home-loan/enabled";
import { templateKeyFor } from "../../lib/templates";

async function main() {
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const rows = await sql`SELECT slug, vertical, template_key, features FROM clients ORDER BY slug`;
await sql.end();

for (const r of rows) {
  const tenant = { features: r.features, templateKey: r.template_key };
  console.log(
    `${String(r.slug).padEnd(24)} vertical=${String(r.vertical).padEnd(11)}` +
      ` homeLoanEnabled=${String(homeLoanEnabled(tenant)).padEnd(5)}` +
      ` templateKeyFor=${templateKeyFor(tenant) ?? "undefined"}`,
  );
}
}

void main();
