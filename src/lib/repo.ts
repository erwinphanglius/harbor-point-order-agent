import { loadSnapshot, loadEmails, hasDataPack } from "../data/load.js";
import { MemoryRepository } from "../repository/memory.js";
import { PgRepository } from "../repository/pg.js";
import { createDb } from "../db/index.js";
import type { Repository } from "../repository/types.js";

const globalStore = globalThis as unknown as { __repo?: Repository };

/** True when a Postgres connection is configured (DATABASE_URL). */
export function isPgConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Single repository factory. Pages, server actions and the CLI all go through
 * here — there is no `if (db)` branching in components. With DATABASE_URL set it
 * returns the Postgres-backed repository; otherwise the in-memory demo store.
 */
export function getRepository(): Repository {
  if (!globalStore.__repo) {
    if (isPgConfigured()) {
      const db = createDb(process.env.DATABASE_URL!);
      globalStore.__repo = new PgRepository(db);
    } else {
      if (!hasDataPack()) {
        throw new Error("Data pack not found under assessment/data-pack");
      }
      globalStore.__repo = new MemoryRepository(loadSnapshot(), loadEmails());
    }
  }
  return globalStore.__repo;
}

/** Reset the cached repository (used by tests and the CLI). */
export function resetRepository(): void {
  delete globalStore.__repo;
}
