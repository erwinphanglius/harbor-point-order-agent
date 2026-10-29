import "dotenv/config";
import { createServer } from "node:http";
import { loadSnapshot, loadEmails, hasDataPack } from "../data/load.js";
import { runOffline } from "../agent/offline.js";

const PORT = Number(process.env.PORT ?? 3000);
const ORDER_DATE = "2026-11-02";

function reviewQueueHtml(): string {
  if (!hasDataPack()) {
    return "<html><body><h1>Harbor Point Order Agent</h1><p>No data pack found.</p></body></html>";
  }
  const snapshot = loadSnapshot();
  const emails = loadEmails();
  const results = runOffline(emails, snapshot, ORDER_DATE);

  const drafted = results.filter((r) => r.disposition === "AUTO_DRAFT");
  const escalated = results.filter((r) => r.disposition === "ESCALATE" || r.disposition === "PROPOSE_CHANGE");

  const rows = (list: typeof results, badge: string) =>
    list
      .map(
        (r) =>
          `<tr><td>${r.emailId}</td><td>${r.subject}</td><td>${r.customerName ?? "—"}</td>` +
          `<td><span>${badge}</span></td><td>${r.issues.map((i) => i.code).join(", ") || "—"}</td></tr>`,
      )
      .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Harbor Point Order Agent</title>
  <style>body{font-family:system-ui,sans-serif;margin:2rem}h1{margin-bottom:0.25rem}table{border-collapse:collapse;width:100%;margin-top:1rem}td,th{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:.9rem}th{background:#f5f5f5}</style></head><body>
  <h1>Harbor Point Order Agent</h1>
  <p>Placeholder review queue. Drafts await a human release click; escalations need a human decision.</p>
  <h2>Drafted, awaiting release (${drafted.length})</h2>
  <table><thead><tr><th>Email</th><th>Subject</th><th>Customer</th><th>State</th><th>Notes</th></tr></thead>
  <tbody>${rows(drafted, "DRAFT")}</tbody></table>
  <h2>Escalated for review (${escalated.length})</h2>
  <table><thead><tr><th>Email</th><th>Subject</th><th>Customer</th><th>State</th><th>Issues</th></tr></thead>
  <tbody>${rows(escalated, "REVIEW")}</tbody></table>
  </body></html>`;
}

const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(reviewQueueHtml());
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Harbor Point Order Agent placeholder UI on http://localhost:${PORT}`);
});
