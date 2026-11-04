import { describe, expect, it } from "vitest";
import { rulesUrgency } from "../../src/core/urgency.js";
import type { Email } from "../../src/core/types.js";

function email(subject: string, body: string): Email {
  return {
    emailId: "E900",
    receivedAt: "2026-11-02T08:00:00Z",
    fromName: "Test",
    fromEmail: "test@example.com",
    to: "orders@harborpoint.example",
    subject,
    body,
    attachments: [],
  };
}

describe("offline urgency fallback", () => {
  it("flags a same-day request as today", () => {
    const u = rulesUrgency(email("Pallet order", "Can you deliver this today before 3pm?"));
    expect(u.level).toBe("today");
    expect(u.source).toBe("rules");
  });

  it("flags a near deadline as soon", () => {
    const u = rulesUrgency(email("Top-up", "We need this by tomorrow morning, please."));
    expect(u.level).toBe("soon");
  });

  it("leaves an order with no deadline at none", () => {
    const u = rulesUrgency(email("Monthly restock", "Please send our usual monthly order when you can."));
    expect(u.level).toBe("none");
  });

  it("never lifts urgency out of an automatic reply", () => {
    const u = rulesUrgency(
      email("Automatic reply: Out of office", "I am away today and will reply tomorrow."),
    );
    expect(u.level).toBe("none");
  });
});
