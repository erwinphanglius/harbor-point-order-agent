import { describe, it, expect } from "vitest";
import { detectDuplicate, extractCustomerPo } from "../../src/core/duplicate.js";
import type { Email } from "../../src/core/types.js";

const base: Email = {
  emailId: "E016",
  receivedAt: "2026-11-02T09:22:00-05:00",
  fromName: "Grace Kim",
  fromEmail: "purchasing@seasideseniorliving.example",
  to: "orders@harborpointsupply.example",
  subject: "FW: PO SSL-7781",
  body: "Resending in case the first one didn't come through.\nPlease supply against PO SSL-7781",
  attachments: [],
};

describe("duplicate PO detection", () => {
  it("flags a PO already seen in an earlier email this batch", () => {
    const r = detectDuplicate(base, new Map([["SSL-7781", "E015"]]), []);
    expect(r.isDuplicate).toBe(true);
    expect(r.duplicateOfEmailId).toBe("E015");
  });

  it("does not treat a cancellation that references an existing PO as a duplicate", () => {
    const cancel = { ...base, subject: "Cancel SOP-1182", body: "Please cancel our PO SOP-1182. Budget frozen." };
    const r = detectDuplicate(cancel, new Map([["SOP-1182", "E017"]]), []);
    expect(r.isDuplicate).toBe(false);
  });

  it("extracts customer PO numbers", () => {
    expect(extractCustomerPo("PO SSL-7781")).toBe("SSL-7781");
    expect(extractCustomerPo("PSD-PO-88231")).toBe("PSD-PO-88231");
  });
});
