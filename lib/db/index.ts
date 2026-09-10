import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// Reused across hot reloads in development so dev doesn't exhaust connections.
const globalForDb = globalThis as unknown as { client?: ReturnType<typeof postgres> };

// Next runs the static export in 15 worker processes; each is its own Node
// process with its own pool, so the ceiling is workers x max. At the runtime
// value of 10 that is 150 connections against a server allowing 97
// (max_connections 100 less 3 superuser-reserved), and the export dies with
// FATAL 53300 "sorry, too many clients already".
//
// 3 gives 15 x 3 = 45, comfortably under. The runtime value stays 10 and is
// deliberate: functions run in bom1 while the pooler is in ap-southeast-2, so
// each serverless instance wants its own small pool rather than a shared one.
//
// Rejected: lowering the production value to 3 for everyone (penalises the
// runtime for a build-only constraint), and reducing Next's worker count
// (slows every build to fix a database-side limit).
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production";

const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: isBuildPhase ? 3 : isProduction ? 10 : 3,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
export { schema };
