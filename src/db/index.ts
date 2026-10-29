import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
