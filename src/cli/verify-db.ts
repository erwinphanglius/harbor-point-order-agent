import "dotenv/config";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { seedDatabase } from "../seed/seed.js";
import { PgRepository } from "../repository/pg.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("FAIL: DATABASE_URL is not set");
  process.exit(1);
}
const DATABASE_URL: string = url;

let failures = 0;
function check(ok: boolean, label: string, extra?: string): void {
  if (ok) console.log(`PASS: ${label}`);
  else {
    console.log(`FAIL: ${label}${extra ? ` — ${extra}` : ""}`);
    failures += 1;
  }
}

async function main(): Promise<void> {
  // One shared single-connection pool is used for everything, so the whole run
  // is safe against a local/PGlite server with max_connections=1.
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });

  // Reset for a deterministic, re-runnable verification run.
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("CREATE SCHEMA public");

  try {
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    check(true, "migrate");
  } catch (e) {
    check(false, "migrate", String(e));
  }

  try {
    await seedDatabase(db);
    check(true, "seed");
  } catch (e) {
    check(false, "seed", String(e));
  }

  const repo = new PgRepository(db);
  try {
    await repo.processInbox();
    check(true, "process");
  } catch (e) {
    check(false, "process", String(e));
  }

  const q = (sqlText: string, params?: unknown[]) => pool.query(sqlText, params);

  const emailCount = Number((await q("select count(*)::int as n from emails")).rows[0].n);
  check(emailCount === 40, "40 emails", `got ${emailCount}`);

  const disp = (await q("select disposition, count(*)::int as n from emails group by disposition")).rows;
  const counts: Record<string, number> = {};
  for (const r of disp) counts[r.disposition] = r.n;
  check(counts["AUTO_DRAFT"] === 12, "12 auto-draft", `got ${counts["AUTO_DRAFT"]}`);
  check(counts["PROPOSE_CHANGE"] === 2, "2 proposal", `got ${counts["PROPOSE_CHANGE"]}`);
  check(counts["ESCALATE"] === 20, "20 escalate", `got ${counts["ESCALATE"]}`);
  check(counts["ROUTE"] === 3, "3 route", `got ${counts["ROUTE"]}`);
  check(counts["DUPLICATE"] === 1, "1 duplicate", `got ${counts["DUPLICATE"]}`);
  check(counts["IGNORE"] === 2, "2 ignore", `got ${counts["IGNORE"]}`);

  const e012 = (await q("select disposition from emails where email_id='E012'")).rows[0];
  check(e012?.disposition === "ESCALATE", "E012 escalated", e012?.disposition);
  const e012Inj = Number((await q("select count(*)::int as n from audit_log where email_id='E012' and action='injection_flagged'")).rows[0].n);
  check(e012Inj >= 1, "E012 injection audit row");
  const e012Drafts = Number((await q("select count(*)::int as n from sales_orders where source_email_id='E012'")).rows[0].n);
  check(e012Drafts === 0, "E012 no draft", `got ${e012Drafts}`);

  const e003Lines = (await q(
    "select l.price_source, count(*)::int as n from sales_order_lines l join sales_orders o on o.so_number=l.so_number where o.source_email_id='E003' group by l.price_source",
  )).rows;
  const e003: Record<string, number> = {};
  for (const r of e003Lines) e003[r.price_source] = r.n;
  check((e003["contract"] ?? 0) === 3 && (e003["list"] ?? 0) === 2, "E003 3 contract + 2 list", JSON.stringify(e003));

  const e005ShipTos = (await q("select distinct ship_to_id from sales_orders where source_email_id='E005' and draft=true")).rows;
  check(e005ShipTos.length === 3, "E005 three drafts on three ship-tos", JSON.stringify(e005ShipTos.map((r) => r.ship_to_id)));

  const e001Order = (await q("select so_number, customer_id from sales_orders where source_email_id='E001' and draft=true limit 1")).rows[0];
  check(!!e001Order, "E001 has a draft");
  if (!e001Order) throw new Error("E001 draft missing; cannot release");
  const soNumber = e001Order.so_number as string;

  const res = await repo.release("E001", soNumber);
  check(res.ok, "E001 release", res.reasons.join("; "));

  const orderAfter = (await q("select draft, released_at from sales_orders where so_number=$1", [soNumber])).rows[0];
  check(orderAfter.draft === false && orderAfter.released_at != null, "released_at set and draft cleared");

  const invRows = (await q("select sku, allocated::float8 as a from inventory where sku in ('HPS-1408','HPS-1402','HPS-1502')")).rows;
  const alloc: Record<string, number> = {};
  for (const r of invRows) alloc[r.sku] = r.a;
  check(alloc["HPS-1408"] === 4 && alloc["HPS-1402"] === 6 && alloc["HPS-1502"] === 2, "stock allocated for E001 lines", JSON.stringify(alloc));

  const cust = (await q("select open_balance::float8 as b from customers where customer_id='C001'")).rows[0];
  check(Math.abs(cust.b - 4872) < 0.01, "credit consumed (C001 balance 4872)", `got ${cust.b}`);

  const humanRel = Number((await q("select count(*)::int as n from audit_log where email_id='E001' and actor='human' and action='released'")).rows[0].n);
  check(humanRel >= 1, "human release audit row");

  const before = {
    emails: Number((await q("select count(*)::int as n from emails")).rows[0].n),
    agentOrders: Number((await q("select count(*)::int as n from sales_orders where source_email_id is not null")).rows[0].n),
    agentAudit: Number((await q("select count(*)::int as n from audit_log where actor='agent'")).rows[0].n),
  };

  await repo.processInbox();
  const after = {
    emails: Number((await q("select count(*)::int as n from emails")).rows[0].n),
    agentOrders: Number((await q("select count(*)::int as n from sales_orders where source_email_id is not null")).rows[0].n),
    agentAudit: Number((await q("select count(*)::int as n from audit_log where actor='agent'")).rows[0].n),
  };
  check(after.emails === before.emails, "no duplicate emails after re-process", `${before.emails}->${after.emails}`);
  check(after.agentOrders === before.agentOrders, "no duplicate draft orders after re-process", `${before.agentOrders}->${after.agentOrders}`);
  check(after.agentAudit === before.agentAudit, "no duplicate audit rows after re-process", `${before.agentAudit}->${after.agentAudit}`);

  const releasedStill = (await q("select draft from sales_orders where so_number=$1", [soNumber])).rows[0];
  check(releasedStill.draft === false, "released order not reset by re-process");

  // Fully close the pool, then reconnect with a FRESH client to prove the
  // release really persisted to disk (not just in a pooled session). The retry
  // tolerates the local/PGlite server briefly holding its single connection
  // slot after a clean pool shutdown.
  await pool.end();
  let persisted = false;
  for (let attempt = 0; attempt < 6 && !persisted; attempt++) {
    const fresh = new Client({ connectionString: DATABASE_URL });
    try {
      await fresh.connect();
      const rows = await fresh.query("select draft, released_at from sales_orders where so_number=$1", [soNumber]);
      persisted = rows.rows[0]?.draft === false && rows.rows[0]?.released_at != null;
      await fresh.end();
    } catch {
      await fresh.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  check(persisted, "release persisted (fresh connection)");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify:db crashed:", e);
  process.exit(1);
});
