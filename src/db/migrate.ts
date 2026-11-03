import "dotenv/config";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./index.js";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. db:migrate applies Drizzle migrations to it.");
    process.exit(1);
  }
  const db = createDb(url);
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
