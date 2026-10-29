import { loadSnapshot, loadEmails, hasDataPack } from "../data/load.js";
import { MemoryRepository } from "../repository/memory.js";
import type { Repository } from "../repository/types.js";

const globalStore = globalThis as unknown as { __repo?: Repository };

/**
 * Lazily build a shared, in-memory repository from the data-pack snapshot.
 * This is the demo/dev backing store: it loads the CSV + email fixtures and runs
 * the offline agent exactly once. A Postgres-backed implementation can replace
 * it when DATABASE_URL is configured (see src/db + src/seed).
 */
export function getRepository(): Repository {
  if (!globalStore.__repo) {
    if (!hasDataPack()) {
      throw new Error("Data pack not found under assessment/data-pack");
    }
    const snapshot = loadSnapshot();
    const emails = loadEmails();
    globalStore.__repo = new MemoryRepository(snapshot, emails);
  }
  return globalStore.__repo;
}
