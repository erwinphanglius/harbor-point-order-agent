# Product brief — Agent-native order-to-cash intake

## User

The operations team at Harbor Point Supply Co. — a fictional B2B distributor of
cleaning, paper, glove and takeout supplies. Customers (restaurants, hotels,
schools, clinics, gyms) email orders in every format imaginable. Today an ops
person reads each email, works out who the customer is and what they want,
checks stock, prices and credit, and re-types it into the ERP.

## Problem

Email intake is manual, slow and error-prone. The 40-email snapshot for a single
Monday morning contains SKU tables, free-text sentences, Spanish, forwarded
threads, a prompt-injection attempt, a spam blast, an out-of-office reply, and
requests that are genuinely ambiguous ("the usual"). Every one currently
requires a full context switch into the ERP and a set of decisions that are easy
to get wrong under time pressure.

## What was built

An **agent-native** intake pipeline: an AI agent does the work *inside* the ERP
through tools we designed (look up a customer, match a product, resolve a
contract price, check stock, check credit, draft an order), rather than just
summarising the email for a human to re-type.

Concretely:

- A pure, deterministic **rule engine** (`src/core`) that parses/normalises
  emails, matches products (including discontinued → replacement), resolves
  prices with contract windows, and checks credit and stock.
- An **offline agent** that runs those rules over all 40 emails with no LLM
  call, and an **OpenRouter** mode that drives the same tools through function
  calling.
- A **review UI** (Next.js): an inbox with disposition badges/filters/search,
  an email detail page with the agent's trace and an editable proposal, and an
  append-only audit trail.
- **Supabase Auth** protecting the app, with a dev mode that runs open when the
  Supabase env vars are absent.

## What was deliberately not built

- A full ERP / warehouse execution layer — releases are recorded but stock
  movements beyond allocation and credit consumption are out of scope.
- Outbound customer email (acknowledgements, quotes, rejection replies).
- Model training or fine-tuning — the LLM path is a thin function-calling
  wrapper over the same tools.
- A production persistence layer in the running UI (the demo UI uses an
  in-memory repository; the Drizzle/Postgres schema and seed exist for a real
  deployment).

## Autonomy vs approval

The central decision is *where to draw the line*.

- **The agent may draft on its own** only when the email is clean and every rule
  passes. Drafting is non-destructive: it writes audit rows and shows the order
  as "drafted, awaiting release".
- **The agent may never release.** Stock allocation and credit consumption
  happen only on a human's release click.
- **Risky cases are escalated with no draft at all:** credit hold / limit,
  stock shortfall, discontinued products, unknown SKU / contact / customer,
  ambiguous quantity or unit, expired or no-record price claims, missing
  attachment, edits to SHIPPED orders, and prompt-injection attempts.
- **Edits to OPEN orders and cancellations are proposed, not applied** — a human
  approves before anything changes.

Rationale: the cost of a bad *draft* is a single corrective click; the cost of a
bad *release* (allocating stock we don't have, breaching credit, shipping to the
wrong place) is real and hard to unwind. So the machine is trusted up to the
point of no return, and no further. Every write is also re-validated at approval
time (price windows, credit, stock, order status), so a draft can never be
released on stale data.

## How success would be measured in production

- **% emails auto-drafted** (vs escalated/routed) — the primary throughput
  metric; higher is better only at constant precision.
- **Release edit rate** — how often a human edits a draft before approving; a
  proxy for agent accuracy that is cheap to log.
- **Time-to-order** — email received → one-click release.
- **Credit / price exceptions caught** — releases blocked by the approval-time
  re-validation (i.e. data changed between draft and release).
- **False-escalation rate** — escalations that a human turns into a clean
  release; the cost of the conservative line.
- **Injection attempts detected** — with the attempt stored in audit and forced
  to human review.
- **Audit completeness** — every agent action and human decision is
  reconstructable from the trail.

## Assumptions

- Prices are USD per selling unit; only whole selling units can be ordered.
- A contract price applies only when the order date is within
  `valid_from`–`valid_to`; otherwise list price applies.
- A customer cannot be released on `CREDIT_HOLD`, nor if open balance plus the
  new order exceeds `credit_limit`.
- `DISCONTINUED` products cannot be sold; `replaced_by` names the successor.
- `SHIPPED` orders cannot be edited; `OPEN` orders can; `PARTIALLY_SHIPPED`
  orders can only change the unshipped quantity.
- Draft creation allocates nothing and consumes no credit.
- The data snapshot is at 07:00 on Monday 2 Nov 2026; everything is fictional.
