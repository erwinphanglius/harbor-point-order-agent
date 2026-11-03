# Harbor Point Order Agent

An agent-native order-to-cash intake for Harbor Point Supply Co. The agent reads
the order inbox, resolves customer / product / price, checks credit and stock,
and **drafts** sales orders that a human releases with one click. Anything risky
is escalated with no draft at all, and every decision is written to an
append-only audit trail.

## Live demo

<https://harbor-point-order-agent-mu.vercel.app>

Sign in with `ops@harborpoint.demo` / `HarborPoint2026!`. The deploy seeds the
ERP snapshot and the 40 raw emails only, so the inbox opens **unprocessed** — the
before state.

Press **Run agent** at the top of the inbox. It drives the tools through
`glm-5.3-flash` on OpenCode Go in batches of five, shows progress as it goes
(`15/40`, tokens, cost), and writes the verdicts, drafts and cost to Postgres.
The dollar figure is the provider's list price: this demo runs on a flat-rate
plan, so no per-request charge is incurred. **Reset** wipes drafts,
releases and the audit trail and re-seeds the raw inbox.

Open **E012** to see a prompt-injection attempt forced to human review, and
**E024 / E025** for the expired and unsupported price claims.

## What it is

- **Inbox** (`/`) — every email with time, sender, subject, classification and a
  disposition badge (auto-draft, proposal, escalate, route, duplicate, ignore),
  plus the customer and amount when known. Filter by disposition, search, and
  bulk-release selected auto-drafts in one click.
- **Email detail** (`/emails/[id]`) — the raw email, the agent's trace, the
  extracted (editable) proposal, rule results/warnings, and actions: *Approve &
  release*, *Save edits then approve*, *Reject with a reason*, *Mark as
  no-action*.
- **Audit** (`/audit`) — the append-only trail, newest first, filterable by
  email and actor (agent / system / human).
- **Auth** — Supabase email/password via `@supabase/ssr`, with a middleware that
  protects every route. If the Supabase env vars are missing the app runs open
  in dev mode with a visible "auth is disabled" banner.

## Architecture (plain words)

1. **Pure rules** (`src/core/*`) — email parsing/normalisation, product
   matching, price resolution (contract windows), credit check, stock check,
   discontinued handling, injection detection, duplicate-PO detection and the
   approval policy. No database, no network.
2. **Agent** (`src/agent/*`) — an offline deterministic engine that runs the
   rules over all 40 emails with no LLM call, and an OpenRouter mode that drives
   the *same* tools through function calling.
3. **Tools** (`src/tools/*`) — the agent's tools (lookup customer/product/price,
   check stock/credit, draft order, propose change, flag review).
4. **Repository** (`src/repository/*`) — one interface, two implementations:
   `memory.ts` (dev/demo, no DB) and `pg.ts` (Drizzle over Postgres). A single
   factory (`src/lib/repo.ts`) picks the Postgres implementation when
   `DATABASE_URL` is set, otherwise the in-memory one.
5. **UI** (`src/app/*`, `src/components/*`) — Next.js App Router (server
   components + server actions) and Tailwind.

### How persistence works

Every page, server action and the CLI goes through the one repository factory
in `src/lib/repo.ts` — there is no `if (db)` branching in components. With
`DATABASE_URL` set, the repository is the Postgres-backed `PgRepository`: the
inbox, dispositions, draft orders, line items (with `price_source`), warnings
and the audit trail all live in `src/db/schema.ts` tables. Releases allocate
stock, consume credit, set `released_at` and write audit rows inside a
transaction, so approvals and releases survive server restarts and serverless
instances. Without `DATABASE_URL`, the memory repository runs the offline agent
once and serves the demo in-process.

## The approval line (and why)

The agent may create an order **only as a draft** when the email is clean and
every rule passes. Drafting is non-destructive: it writes audit rows and puts
the order in the queue as "drafted, awaiting release". **Nothing is released** —
no stock allocated, no credit consumed, not a real order — until a human clicks
release. We drew the line there because the cost of a bad *release* (allocating
stock we don't have, shipping to a bad actor, breaching credit) is irreversible,
while the cost of a bad *draft* is a single human click to fix.

Everything risky is escalated with no draft: credit hold/limit, stock shortfall,
discontinued products (with a proposed `replaced_by`), unknown SKU / contact /
customer, ambiguous quantity or unit, expired or no-record price claims, missing
attachment, edits to SHIPPED orders, and prompt-injection attempts. Edits to
OPEN orders and cancellations are *proposed* for human approval. Every write
goes through a server action that **re-validates at approval time** (price
windows, credit, stock, order status) and refuses with a clear reason if the
data changed since the proposal.

## Local run

```bash
npm install

# Tests / typecheck / lint
npm run test
npm run typecheck
npm run lint

# Migrations (generated; apply with db:migrate)
npm run db:generate

# Apply the committed Drizzle migrations to DATABASE_URL (idempotent)
DATABASE_URL=postgresql://... npm run db:migrate

# Seed the Postgres DB (idempotent; requires DATABASE_URL)
DATABASE_URL=postgresql://... npm run db:seed

# Persist every email's classification, disposition, drafts, warnings and audit
# rows to Postgres (idempotent). Without DATABASE_URL this is the dry-run report.
DATABASE_URL=postgresql://... npm run process
AGENT_MODE=offline npm run process -- --dry-run

# End-to-end persistence check: migrate -> seed -> process -> assert counts,
# E012/E003/E005, release E001 (stock+credit+audit), re-read on a fresh
# connection, re-run process and assert no duplicates.
DATABASE_URL=postgresql://... npm run verify:db

# Start the UI (runs open in dev mode without Supabase env)
npm run dev
# or production build + serve
npm run build && npm start
```

## Deployment (Vercel + Supabase)

Setup order:

1. Create a Supabase project (any region; Singapore is closest to Jakarta).
2. Project settings → Database → **Connection string → Session pooler**. Put it
   in `DATABASE_URL`. Set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from
   Project settings → API.
3. Import the repo into Vercel and add the same variables to the Vercel project
   (Production and Preview). The build runs `npm run check`, then
   `npm run db:setup`, then `next build` — `db:setup` applies the migrations,
   seeds the ERP snapshot and the 40 emails, and runs the agent once. Every step
   is idempotent, so a redeploy does not duplicate rows. Without `DATABASE_URL`
   it is skipped.
4. Enable the Supabase **email** provider (Authentication → Providers) and add a
   user under Authentication → Users to sign in with.
5. Set the Vercel **Function Region** (Project → Settings → Functions) to the
   same region as the Supabase project — `sin1` for Singapore. Each page makes a
   handful of database round trips, so a cross-continent function region adds a
   few hundred milliseconds to every navigation.

Running the setup by hand instead of at build time works the same way:
`npm run db:migrate`, `npm run db:seed`, `npm run process`.

`npm run verify:db` runs migrate → seed → process → assertions → a release →
fresh-connection re-read → idempotency check, so it's the one command to prove a
deployment's database is wired correctly.

CI/CD is the Vercel pipeline: every push to `main` installs, then runs
`npm run check` (lint, typecheck, the full test suite) before `next build`, so a
failing check fails the deploy instead of shipping. A daily Vercel cron hits
`/api/keepalive`, which runs `select 1` against Supabase so the free tier does
not pause after a week of inactivity.

## Agent tool list

`lookup_customer`, `lookup_product`, `get_contract_price`, `check_inventory`,
`check_credit`, `create_draft_order` (draft only), `propose_order_change`,
`flag_for_review`. Offline mode calls the same underlying rules in a fixed
sequence; OpenRouter mode exposes them as function-calling tools.

## Reproducing the 40-email run

`AGENT_MODE=offline npm run process -- --dry-run` reads
`assessment/data-pack/emails.jsonl` + `data/*.csv` and writes
`reports/process-report.offline.dry-run.json`. Expected: 40 emails →
12 auto-draft (14 draft orders), 2 propose-change, 20 escalate, 3 route,
1 duplicate, 2 ignore.

## Where the audit lives

`/audit` in the UI, and the `audit_log` table (`src/db/schema.ts`) in the
Postgres store (the in-memory demo store keeps it in `src/repository/memory.ts`).
Every agent action, every human release/reject/edit and every system side-effect
(stock allocation, credit consumption) writes a row with `actor`, `action` and
`detail`.

## Data

The assessment data-pack (40 emails + ERP snapshot as CSVs) lives under
`assessment/data-pack/`. All companies, people and email addresses are invented;
every email domain ends in `.example`.
