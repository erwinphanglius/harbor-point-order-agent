# Harbor Point Order Agent

Agent-native order-to-cash intake for Harbor Point Supply Co.: read the order
inbox, resolve customer/product/price, check credit and stock, and **draft**
sales orders that a human releases with one click. Anything risky is escalated
with no draft at all.

## What it does

- Reads the 40-email inbox (`assessment/data-pack/emails.jsonl`).
- **Offline mode** (`AGENT_MODE=offline`): a deterministic rule engine classifies
  and drafts every email with no LLM call.
- **OpenRouter mode** (`AGENT_MODE=openrouter`): an LLM agent drives the same
  tools through OpenRouter function calling.
- Drafts allocate **no** stock and consume **no** credit. Release is a separate,
  human-only action (`sales_orders.draft`, `created_by_agent`, `released_at`).
- Every decision writes an audit row; injection attempts are recorded and forced
  to human review.

## Layout

```
src/core/        pure business rules (parsing, matching, pricing, credit, stock,
                 injection, duplicate, approval policy) — no DB/network
src/tools/       the agent's tools (shared by offline + OpenRouter)
src/agent/       offline engine + OpenRouter agent
src/db/          Drizzle schema (Postgres)
src/seed/        idempotent seed from data-pack CSVs + emails.jsonl
src/cli/         npm run process
src/server/      placeholder review-queue page
tests/           vitest suites (<30 cases)
docs/plan.md     plan, product brief, task breakdown
reports/         committed dry-run report
```

## Local run

```bash
npm install

# Run the deterministic offline pipeline over all 40 emails (no DB, no LLM).
# Writes reports/process-report.offline.dry-run.json
AGENT_MODE=offline npm run process -- --dry-run

# Tests / typecheck / lint
npm run test
npm run typecheck
npm run lint

# Generate Drizzle migrations (never applied automatically)
npm run db:generate

# Placeholder review-queue page (uses the offline engine, no DB)
npm run dev
```

## Database (Postgres)

- Schema is defined in `src/db/schema.ts`; migrations are generated with
  `npm run db:generate` and are committed but **never auto-applied**.
- `DATABASE_URL` is the only connection target. Seed idempotently with:

```bash
DATABASE_URL=postgres://... npm run db:seed
```

## Key decision

The agent may create an order **only as a draft** when the email is clean and
every rule passes. Nothing is released (no stock allocated, no credit consumed,
not a real order) until a human clicks release. Risky cases — credit hold/limit,
stock shortfall, discontinued, unknown SKU/contact/customer, ambiguous
quantity/unit, expired or no-record price claims, missing attachment, edits to
SHIPPED orders — are escalated with no draft. Edits to OPEN orders and
cancellations are *proposed* for human approval. Prompt-injection attempts are
detected, stored in audit, and forced to human review.
