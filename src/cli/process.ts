import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadSnapshot, loadEmails, hasDataPack } from "../data/load.js";
import { runOffline } from "../agent/offline.js";
import { runOpenRouter } from "../agent/openrouter.js";
import type { ProcessingResult } from "../core/types.js";

const DRY_RUN = process.argv.includes("--dry-run");
const AGENT_MODE = (process.env.AGENT_MODE ?? "offline").toLowerCase();
const ORDER_DATE = "2026-11-02";

function summarize(results: ProcessingResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    counts[r.disposition] = (counts[r.disposition] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  if (!hasDataPack()) {
    console.error("Data pack not found under assessment/data-pack.");
    process.exit(1);
  }

  const snapshot = loadSnapshot();
  const emails = loadEmails();

  let results: ProcessingResult[];
  if (AGENT_MODE === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("AGENT_MODE=openrouter requires OPENROUTER_API_KEY.");
      process.exit(1);
    }
    results = await runOpenRouter(emails, snapshot, ORDER_DATE, apiKey, process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini");
  } else {
    results = runOffline(emails, snapshot, ORDER_DATE);
  }

  // Assign SO numbers to drafts (continuing after the existing SO-24xxx range).
  const maxSo = Math.max(...snapshot.orders.map((o) => parseInt(o.soNumber.replace(/\D/g, ""), 10) || 0));
  let draftCursor = maxSo;
  let draftCount = 0;
  for (const r of results) {
    for (const d of r.drafts) {
      draftCursor += 1;
      draftCount += 1;
      (d as { soNumber?: string }).soNumber = `SO-${draftCursor}`;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    agentMode: AGENT_MODE,
    dryRun: DRY_RUN,
    orderDate: ORDER_DATE,
    totalEmails: results.length,
    draftOrdersCreated: draftCount,
    summary: summarize(results),
    results,
  };

  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  const reportPath = resolve(process.cwd(), "reports", `process-report.${AGENT_MODE}${DRY_RUN ? ".dry-run" : ""}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`agent mode : ${AGENT_MODE}`);
  console.log(`dry run    : ${DRY_RUN}`);
  console.log(`emails     : ${results.length}`);
  console.log(`drafts     : ${draftCount}`);
  console.log(`summary    : ${JSON.stringify(summarize(results))}`);
  console.log(`report     : ${reportPath}`);

  console.log("\nPer-email outcome:");
  for (const r of results) {
    const so = r.drafts.map((d) => (d as { soNumber?: string }).soNumber).join(",");
    const flag = r.issues.length ? ` [${r.issues.map((i) => i.code).join(",")}]` : "";
    console.log(
      `${r.emailId} ${r.disposition.padEnd(14)} ${r.classification.padEnd(13)} ${(so ? so : "—").padEnd(18)} ${flag}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
