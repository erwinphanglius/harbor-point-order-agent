import { describe, expect, it } from "vitest";
import { applyPolicy, finalize } from "../../src/agent/llm.js";
import { processEmail } from "../../src/core/pipeline.js";
import { loadEmails, loadSnapshot } from "../../src/data/load.js";

const snapshot = loadSnapshot();
const emails = loadEmails();
const orderDate = "2026-11-02";

function judge(emailId: string, urgency: { level?: string; reason?: string } | null) {
  const email = emails.find((e) => e.emailId === emailId)!;
  const llm = finalize(
    email,
    { classification: "ORDER", lines: [{ sku: "HPS-1201", quantity: 4 }], urgency } as never,
    snapshot,
    orderDate,
    new Map(),
  );
  const policy = processEmail(email, snapshot, { orderDate, poSeen: new Map() });
  return { llm, merged: applyPolicy(llm, policy) };
}

describe("agent-decided urgency", () => {
  it("keeps the deadline the model read out of the email", () => {
    const { llm, merged } = judge("E001", { level: "today", reason: "needs it for the Saturday expo" });
    expect(llm.urgency).toEqual({ level: "today", reason: "needs it for the Saturday expo", source: "agent" });
    expect(merged.urgency.level).toBe("today");
    expect(merged.urgency.source).toBe("agent");
  });

  it("falls back to none when the model gives no usable level", () => {
    const { llm } = judge("E001", { level: "whenever", reason: "" });
    expect(llm.urgency.level).toBe("none");
    expect(llm.urgency.source).toBe("agent");
    expect(llm.urgency.reason).toBeTruthy();
  });

  it("survives the policy layer taking the outcome over", () => {
    const { merged } = judge("E012", { level: "soon", reason: "asks for Friday delivery despite the credit hold" });
    expect(merged.disposition).toBe("ESCALATE");
    expect(merged.urgency).toEqual({
      level: "soon",
      reason: "asks for Friday delivery despite the credit hold",
      source: "agent",
    });
  });
});
