# Harbor Point Order Agent

An agent-native order-to-cash intake for Harbor Point Supply Co. The agent reads
the order inbox, resolves customer / product / price, checks credit and stock,
and **drafts** sales orders that a human releases with one click. Anything risky
is escalated with no draft at all, and every decision is written to an
append-only audit trail.

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
4. **Repository** (`src/repository/*`) — an in-memory store that runs the
   offline agent once and serves the UI, with a Postgres/Drizzle schema and
   seed path for a real deployment.
5. **UI** (`src/app/*`, `src/components/*`) — Next.js App Router (server
   components + server actions) and Tailwind.

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

# Migrations (generated, never auto-applied)
npm run db:generate

# Seed the Postgres DB (idempotent; requires DATABASE_URL)
DATABASE_URL=postgresql://... npm run db:seed

# Run the deterministic offline agent over all 40 emails (no DB, no LLM).
# Writes reports/process-report.offline.dry-run.json
AGENT_MODE=offline npm run process -- --dry-run

# Start the UI (runs open in dev mode without Supabase env)
npm run dev
# or production build + serve
npm run build && npm start
```

## Deployment (Vercel + Supabase)

1. Create a Supabase project. Copy the **Session pooler** connection string into
   `DATABASE_URL`, and set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Import the repo into Vercel (it auto-detects Next.js; `vercel.json` pins the
   build). Add the same env vars in the Vercel project settings.
3. Run `npm run db:seed` once against `DATABASE_URL` to load the ERP snapshot.
4. Enable the Supabase **email** auth provider and create a user to sign in.

CI runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test` and
`npm run build` on every push and PR (`.github/workflows/ci.yml`). A weekly
keepalive workflow pings the Supabase project so the free tier does not pause.

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

`/audit` in the UI, `src/repository/memory.ts` in the demo store, and the
`audit_log` table (`src/db/schema.ts`) in a real deployment. Every agent action,
every human release/reject/edit and every system side-effect (stock allocation,
credit consumption) writes a row with `actor`, `action` and `detail`.

## Data

The assessment data-pack (40 emails + ERP snapshot as CSVs) lives under
`assessment/data-pack/`. All companies, people and email addresses are invented;
every email domain ends in `.example`.
