import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { clients, clientApiKeys } from "../lib/db/schema";
import { mintApiKey } from "../lib/api-keys";

/**
 * Issues, lists and revokes the API keys a client site uses to post leads to
 * `POST /api/v1/leads`.
 *
 * The secret half of a key is printed once, here, and never stored — only its
 * SHA-256 digest goes to the database. There is no command to recover one
 * because there is nothing to recover from: a lost key is revoked and replaced.
 *
 *   pnpm keys:issue  <slug> --label "production"
 *   pnpm keys:issue  <slug> --list
 *   pnpm keys:issue  <slug> --revoke <prefix>
 */

const slug = process.argv[2];
const args = process.argv.slice(3);

function flag(name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
}

async function main() {
  if (!slug || slug.startsWith("--")) {
    console.error("Usage: pnpm keys:issue <client-slug> [--label <name>] [--list] [--revoke <prefix>]");
    process.exit(1);
  }

  const [client] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
  if (!client) {
    console.error(`No client with slug "${slug}".`);
    process.exit(1);
  }
  if (!client.isActive) {
    console.warn(`Warning: "${slug}" is not active. Its keys will be refused until it is.`);
  }

  if (args.includes("--list")) return list(client.id);

  const revokePrefix = flag("--revoke");
  if (revokePrefix) return revoke(client.id, revokePrefix);

  return issue(client.id, flag("--label") ?? `${slug} production`);
}

async function issue(clientId: string, label: string) {
  const { token, keyPrefix, keyHash } = mintApiKey();

  await db.insert(clientApiKeys).values({ clientId, keyPrefix, keyHash, label });

  console.log(`\nKey issued for "${slug}" — ${label}`);
  console.log("\n  " + token + "\n");
  console.log("This is the only time the key is shown. Store it in the client site's");
  console.log("server environment, never in code that reaches a browser.\n");
  console.log("  curl -X POST https://<your-host>/api/v1/leads \\");
  console.log(`    -H "Authorization: Bearer ${token}" \\`);
  console.log('    -H "Idempotency-Key: $(uuidgen)" \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"name":"Test Lead","phone":"9876543210","message":"hello","consent":true}\'\n');
}

async function list(clientId: string) {
  const rows = await db
    .select()
    .from(clientApiKeys)
    .where(eq(clientApiKeys.clientId, clientId))
    .orderBy(desc(clientApiKeys.createdAt));

  if (rows.length === 0) {
    console.log(`No keys for "${slug}".`);
    return;
  }

  console.log(`\nKeys for "${slug}":\n`);
  for (const row of rows) {
    const state = row.revokedAt ? `revoked ${row.revokedAt.toISOString().slice(0, 10)}` : "active";
    const used = row.lastUsedAt ? row.lastUsedAt.toISOString().slice(0, 16).replace("T", " ") : "never used";
    console.log(`  ${row.keyPrefix}  ${state.padEnd(20)} ${used.padEnd(18)} ${row.label}`);
  }
  console.log();
}

async function revoke(clientId: string, keyPrefix: string) {
  const updated = await db
    .update(clientApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(clientApiKeys.clientId, clientId),
        eq(clientApiKeys.keyPrefix, keyPrefix),
        isNull(clientApiKeys.revokedAt),
      ),
    )
    .returning();

  if (updated.length === 0) {
    console.error(`No active key with prefix "${keyPrefix}" for "${slug}".`);
    process.exit(1);
  }
  console.log(`Revoked ${keyPrefix} ("${updated[0].label}"). It is refused from the next request.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
