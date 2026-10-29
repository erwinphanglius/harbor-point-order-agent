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
