import { describe, expect, it } from "vitest";
import { applyPolicy, finalize } from "../../src/agent/llm.js";
import { processEmail } from "../../src/core/pipeline.js";
import { loadEmails, loadSnapshot } from "../../src/data/load.js";

const snapshot = loadSnapshot();
const emails = loadEmails();
const orderDate = "2026-11-02";

function run(emailId: string, skus: { sku: string; quantity: number }[]) {
  const email = emails.find((e) => e.emailId === emailId)!;
  const llm = finalize(
    email,
    { classification: "ORDER", lines: skus },
    snapshot,
    orderDate,
    new Map(),
  );
  const policy = processEmail(email, snapshot, { orderDate, poSeen: new Map() });
  return { llm, policy, merged: applyPolicy(llm, policy) };
}

describe("multi-destination orders", () => {
  const lines = [
    { sku: "HPS-1305", quantity: 4 },
    { sku: "HPS-1201", quantity: 6 },
    { sku: "HPS-1101", quantity: 5 },
    { sku: "HPS-1304", quantity: 5 },
  ];

  it("the model's single combined draft is replaced by one order per delivery address", () => {
    const { llm, policy, merged } = run("E005", lines);
    expect(llm.drafts).toHaveLength(1);
    expect(policy.drafts).toHaveLength(3);
    expect(merged.drafts).toHaveLength(3);
    expect(merged.disposition).toBe("AUTO_DRAFT");
    expect(merged.drafts.map((d) => d.shipToId)).toEqual(["S006", "S007", "S008"]);
    const total = merged.drafts.reduce((sum, d) => sum + d.orderTotal, 0);
    expect(Math.round(total * 100) / 100).toBe(999.5);
    expect(merged.drafts.map((d) => d.lines.length)).toEqual([2, 2, 1]);
    expect(merged.notes.join(" ")).toContain("split into 3 orders");
  });

  it("leaves a normal single-address order alone", () => {
    const { merged } = run("E001", [{ sku: "HPS-1201", quantity: 4 }]);
    expect(merged.drafts).toHaveLength(1);
  });
});
