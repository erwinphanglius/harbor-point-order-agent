import { execSync } from "node:child_process";

// Deploy-time database setup. Vercel runs this as part of the build so a fresh
// demo environment comes up populated: apply migrations, seed the ERP data and
// the 40 emails, then run the agent once. Every step is idempotent, so repeated
// deploys do not duplicate rows. Without DATABASE_URL it is a no-op, which keeps
// local builds and CI independent of a database.

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set - skipping database setup.");
  process.exit(0);
}

const steps = ["db:migrate", "db:seed", "process"];

for (const step of steps) {
  console.log(`\n> npm run ${step}`);
  execSync(`npm run ${step}`, { stdio: "inherit", env: process.env });
}

console.log("\nDatabase ready.");
