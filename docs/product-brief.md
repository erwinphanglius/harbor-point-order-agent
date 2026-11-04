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
- Multi-user roles and permissions — one operator role. The demo persists to
  Postgres (Drizzle), with an in-memory repository kept only for tests and
  `AGENT_MODE=offline`.

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

## What the brief left open

The brief says the emails are realistic and that anything the README does not
cover is a product decision. These are the ones I hit, the call I made, and why.

- **“The usual please” (E036) has no line items → escalate, no draft.** Repeating
  the customer's last order is a guess about quantity and timing; a human opens
  the last order and does it in one click, which is cheaper than a wrong order.
- **“gloves too” (E035) and a forwarded “Northgate restock” (E034) → escalate.**
  E034 is clean enough to draft because the forward carries the item list; E035
  is a fragment that only makes sense with the previous email, and I do not let
  the agent invent the missing half of a sentence.
- **“Why is my order not here??” (E027) → route to a person, not close.** It reads
  like a complaint because it is one; a status complaint can turn into a credit
  or a re-ship, so silently closing it is the worst possible answer.
- **A quote request (E009) → route, no order.** A quote is a different artifact
  with pricing discretion attached; drafting an order would over-commit.
- **Forwarded duplicate (E016 of E015) → link to the PO already in flight.** Two
  drafts for one purchase order double-book stock, which is the expensive
  failure mode. Detection is scoped to the same PO reused or resent, not “any
  mention of a PO” — that would have mislabelled the change (E004) and the
  return (E018).
- **A change to an already-shipped order (E018) → escalate.** That is a returns
  and credit problem, not an edit to an open order.
- **Instructions inside an email (E012) → treat the text as data.** The attempt
  is recorded in the audit trail and forced to a human; no rule in the body is
  obeyed.
- **One email, three addresses (E005) → one order per ship-to.** Delivery,
  dates and paperwork are per address; splitting by product line would create
  one order that ships to three clubs.
- **Junk: an auto-reply (E028) and cold outreach (E029) → set aside, restorable.**
  Traffic that no human needs to read, but reversible so a misfile costs one
  click and nothing is lost.
- **A Spanish order (E011) → the same pipeline, no special path.** Language is
  not a risk category; if the items resolve, it is a clean order.
- **Short but complete (“more” E037, “Restroom supplies” E039) → draft.** The test
  is not length: it is whether product, quantity and ship-to resolve. E037 and
  E039 do; E036 does not.

## Assumptions

Each one is a decision, not a fact from the data.

- **Prices are USD per selling unit, whole units only** — the catalogue is priced
  per case/pack and the ERP has no fractional stock, so partial units would
  invent a price.
- **A contract price applies only inside `valid_from`–`valid_to`, otherwise list
  price** — an expired contract is a renegotiation, and guessing which price the
  customer expects is exactly the kind of error that erodes trust in the tool.
- **`CREDIT_HOLD` blocks release; so does exceeding `credit_limit`** — the
  conservative reading: the agent may still draft, but a human owns the decision
  to go over the line.
- **`DISCONTINUED` products cannot be sold, `replaced_by` names the successor** —
  the catalogue carries a successor field, so silently substituting would be a
  product decision made by a parser.
- **`SHIPPED` cannot be edited; `OPEN` can; `PARTIALLY_SHIPPED` only the
  unshipped quantity** — anything already on a truck is a returns process, and
  the ERP has no path for that.
- **Draft creation allocates nothing and consumes no credit** — drafting has to
  be free, or the approval line is decorative.
- **The snapshot is 07:00 Monday 2 Nov 2026 and everything is fictional** — the
  emails and dates only make sense relative to a fixed “now”; a moving clock
  would turn valid orders into date-in-past escalations overnight.
