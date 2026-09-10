/**
 * The two cache tags that make a platform edit visible without waiting out the
 * cache window, defined once each because a tag is matched by string equality
 * and a typo fails silently — Next never warns that a tag matched nothing.
 *
 * Two tags rather than one, because the two producers know the tenant by
 * different keys and neither can cheaply learn the other's: `lookupClientBySlug`
 * in lib/tenant.ts is given a slug and has not yet read the row, while every
 * cached read in lib/content.ts is given a clientId and never sees the slug. A
 * writer holds the whole row, so invalidating both costs one extra line at the
 * one place that can afford it.
 *
 * Both stay far under Next's 256-character tag limit; a tag over it is never
 * assigned to cached data, and revalidating it then does nothing.
 *
 * This module imports nothing on purpose, so it can be reached from a Client
 * Component's module graph without dragging the database driver in.
 */

/** Expires `lookupClientBySlug` in lib/tenant.ts, and every page that read it. */
export function tenantSlugTag(slug: string): string {
  return `tenant-slug:${slug}`;
}

/** Expires the clientId-scoped cached reads in lib/content.ts, and their readers. */
export function tenantDataTag(clientId: string): string {
  return `tenant:${clientId}`;
}
