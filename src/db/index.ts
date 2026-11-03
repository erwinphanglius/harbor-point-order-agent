import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

export function createDb(url: string) {
  // Single-connection pool: safe against a PGlite/local server with
  // max_connections=1, and correct for the low-concurrency review workload.
  const pool = new Pool({ connectionString: url, max: 1 });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;

const globalStore = globalThis as unknown as { __sharedDb?: Db };

/**
 * One connection pool per process, shared by the repository and any route that
 * needs a cheap query (e.g. the keepalive cron). Avoids opening a second pool
 * against a database with a single connection slot.
 */
export function getSharedDb(): Db | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!globalStore.__sharedDb) {
    globalStore.__sharedDb = createDb(url);
  }
  return globalStore.__sharedDb;
}
