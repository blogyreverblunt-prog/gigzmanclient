import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientApiKeys, clients } from "@/lib/db/schema";

/**
 * Per-client API credentials for the lead ingest endpoint.
 *
 * A key is `gz_live_<prefix>_<secret>`. The prefix is a lookup handle stored in
 * clear — it identifies *which* key without proving possession of it. The
 * secret is 32 bytes from a CSPRNG, stored only as a SHA-256 digest, and shown
 * to the operator exactly once at creation.
 *
 * Splitting the token this way is what makes the lookup possible at all: you
 * cannot index a hash you have to compute per candidate row, so something
 * greppable has to travel alongside the secret.
 */

const TOKEN_PATTERN = /^gz_live_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

/** Long enough that the update is meaningful, rare enough to not cost a write per lead. */
const LAST_USED_STALE_MS = 5 * 60 * 1000;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface MintedKey {
  /** Shown once. Never recoverable afterwards. */
  token: string;
  keyPrefix: string;
  keyHash: string;
}

export function mintApiKey(): MintedKey {
  const keyPrefix = randomBytes(6).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return { token: `gz_live_${keyPrefix}_${secret}`, keyPrefix, keyHash: sha256(secret) };
}

/**
 * Resolves a bearer token to the client that owns it, or null.
 *
 * Null covers every failure — malformed, unknown, revoked — on purpose: the
 * caller returns one generic 401 for all of them, so a probe cannot use the
 * response to learn that a prefix exists.
 */
export async function clientIdForApiKey(token: string): Promise<string | null> {
  const match = TOKEN_PATTERN.exec(token.trim());
  if (!match) return null;

  const [, keyPrefix, secret] = match;

  // Joined to `clients` so a deactivated tenant is off the air for API writes
  // too, matching what `submitQuery` already enforces for its own forms. A key
  // belonging to a switched-off client is treated exactly like an unknown one.
  const [row] = await db
    .select({
      id: clientApiKeys.id,
      clientId: clientApiKeys.clientId,
      keyHash: clientApiKeys.keyHash,
      lastUsedAt: clientApiKeys.lastUsedAt,
    })
    .from(clientApiKeys)
    .innerJoin(clients, eq(clients.id, clientApiKeys.clientId))
    .where(
      and(
        eq(clientApiKeys.keyPrefix, keyPrefix),
        isNull(clientApiKeys.revokedAt),
        eq(clients.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  // Constant-time, so response timing cannot be used to recover the digest a
  // byte at a time. Both sides are fixed-length hex, so the lengths always match
  // and the length check below is a guard against a corrupted row, not input.
  const expected = Buffer.from(row.keyHash, "utf8");
  const actual = Buffer.from(sha256(secret), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  // Best-effort, and rate-limited to one write per key per 5 minutes: this runs
  // on every accepted lead, and the pooler is a cross-region hop, so a write
  // here would otherwise double the cost of the request for a field nothing
  // reads in real time.
  const last = row.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - last > LAST_USED_STALE_MS) {
    await db
      .update(clientApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(clientApiKeys.id, row.id));
  }

  return row.clientId;
}

/** Pulls the token out of `Authorization: Bearer <token>`. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer" || rest.length !== 1) return null;
  return rest[0];
}
