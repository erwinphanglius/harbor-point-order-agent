# Harbor Point Order Agent — Implementation Plan

## 1. Product brief (summary)

**User.** The ops team at Harbor Point Supply Co. reads ~40 order emails a day,
works out who the customer is and what they want, checks stock/prices/credit, and
retypes everything into the ERP.

**Problem.** Email intake is manual, error-prone, and slow. The emails arrive in
every format (SKU tables, natural language, Spanish, forwarded threads, replies),
and each one currently needs a human to do a full context switch into the ERP.

**What we built.** An *agent-native* intake pipeline: an agent (deterministic
offline engine, or an LLM agent over the same tools via OpenRouter function
calling) reads each email, resolves the customer, product and price, checks
credit and stock, and — where every rule passes — **creates a sales order as a
DRAFT**. Nothing is released (no stock allocated, no credit consumed, not a real
order) until a human clicks release in the review queue.

**What we did not build.** A full UI (placeholder page only), outbound email,
real ERP writes, and the release/warehouse workflow.

**The line between agent and human (the key decision).** The agent may *draft*
an order on its own **only** when the email is clean and every rule passes.
Drafting is non-destructive: it writes audit rows and shows the order in the
review queue as "drafted, awaiting release". The agent may **not** release.
Everything risky is escalated with no draft at all:

- credit hold or credit-limit breach → escalate
- insufficient / no stock, or a requested date that can't be met → escalate
- discontinued product → propose the `replaced_by` successor, human approves the substitution
- invalid/unknown SKU → escalate
- ambiguous quantity, unit or "the usual" → escalate
- price claim that is expired (E024) or has no record (E025) → escalate
- new/unknown customer or unknown contact → escalate
- missing attachment, foreign language, spam/auto-reply/duplicate → route/ignore/dedup
- changes to an **OPEN** order (E004) and cancellations → the agent *proposes* the change, a human approves before it is applied
- edits to a **SHIPPED** order → escalate (cannot be edited)
- prompt-injection attempt (E012) → forced to human review, attempt recorded in audit

**Measuring success in production.** (1) Precision/recall of auto-drafts vs
escalations vs a golden set of the 40 emails; (2) release time from email to
one-click release; (3) zero released orders that violate a rule (credit, stock,
discontinued, price); (4) false-escalation rate; (5) injection attempts detected.

## 2. Task breakdown (for AI coding agents)

- **T1 — Scaffold.** TS + Drizzle + Vitest project with `lint`, `typecheck`,
  `test`, `db:generate`, `db:seed`, `process` scripts. AC: all scripts run.
- **T2 — Schema + migrations.** Drizzle schema for customers, contacts,
  addresses, products, prices, inventory, incoming supply, orders (+ `draft`,
  `created_by_agent`, `released_at`), order lines, emails, audit log. Migrations
  generated, never applied. AC: `npm run db:generate` emits SQL.
- **T3 — Core rules (pure).** Email parsing/normalisation, product matching,
  price resolution (contract windows), credit check, stock check, discontinued
  handling, injection detection, duplicate detection, approval policy. All in
  `src/core/`, no DB/network. AC: Vitest covers every rule case.
- **T4 — Tools + agent.** Tool registry (lookup customer/product/price,
  check stock/credit, draft order, propose change, flag review). Offline engine
  uses the same tools deterministically; OpenRouter mode uses the same tools via
  function calling. AC: offline processes all 40 emails; openrouter parses tool calls.
- **T5 — Seed.** Idempotent upsert from `data/*.csv` + `emails.jsonl`.
- **T6 — CLI + placeholder UI.** `npm run process [-- --dry-run]`; placeholder
  page listing the review queue.

## 3. Key data decisions / assumptions

- Prices in USD per selling unit; only whole selling units can be ordered.
- Contract price applies only when order date is within `valid_from`..`valid_to`; otherwise list price.
- Draft creation allocates nothing and consumes no credit; release is the only mutating boundary.
- Duplicate PO detection matches `customer_po` (or "resending"/"Forwarded" + same PO body).
- Emails whose from-domain matches a known customer but whose address is unknown → escalate (verify sender).

## 4. Phases

- **PHASE 1 — scaffold + schema + seed + core rules** (this document + T1/T2/T3/T5).
- **PHASE 2 — agent + tools + offline engine + approval policy + tests** (T4/T6 + tests).
- **PHASE 3 — UI + live URL + release workflow** (shipped: inbox, email detail,
  audit trail, Supabase auth, release/allocate/credit transaction, Vercel deploy).

## 5. Verification

`npm run lint`, `npm run typecheck`, `npm run test`, `npm run db:generate`,
`AGENT_MODE=offline npm run process -- --dry-run` → JSON report committed under `reports/`.
