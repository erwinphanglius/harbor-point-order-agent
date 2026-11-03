# Task breakdown

The build was driven by two prompts given to an AI coding agent. This file
turns those prompts into concrete tasks (T1…Tn) with acceptance criteria, and a
one-line note on how each was verified.

- **Prompt A** (PHASE 1–2): scaffold + schema + seed + core rules; agent + tools
  + offline engine + approval policy + tests. Decision: the agent may create a
  sales order only as a **DRAFT**; nothing is released without a human click.
- **Prompt B** (PHASE 3–5): review UI (Next.js), auth + deploy + CI, and the
  written deliverables.

---

## T1 — Scaffold

**Spec.** TypeScript project with Drizzle, Vitest and scripts `lint`,
`typecheck`, `test`, `db:generate`, `db:seed`, `process`, `dev`, `build`.
Core logic must live in `src/core/` as pure functions (no DB/network).

**Acceptance.** `npm run lint|typecheck|test` exit 0; `npm run db:generate`
emits SQL; `AGENT_MODE=offline npm run process -- --dry-run` runs with no DB.

**Verified.** All scripts green in CI-style local run; dry-run produces the
40-email report.

## T2 — Schema + migrations

**Spec.** Drizzle schema for customers, contacts, addresses, products, prices,
inventory, incoming supply, orders, order lines, emails, audit log, review
items. `sales_orders` gains `draft`, `created_by_agent`, `released_at`.
Migrations are generated (`drizzle-kit generate`) but **never applied**; no DB
connection except `DATABASE_URL`.

**Acceptance.** `npm run db:generate` produces `drizzle/0000_*.sql`; schema
contains the draft/release columns.

**Verified.** Migration generated and committed; no migrate step exists.

## T3 — Core rules (pure)

**Spec.** Email parsing/normalisation, product matching (incl. discontinued →
`replaced_by`), price resolution with contract windows, credit check, stock
check, injection detection, duplicate-PO detection, classification, approval
policy, and the pipeline orchestrator.

**Acceptance.** Vitest covers every rule case (expired contract price E024,
no-record price claim E025, credit hold, discontinued + replacement,
partial-ship edit, duplicate PO, injection) with no DB/network.

**Verified.** 40 tests pass; E012 trips injection and is forced to review.

## T4 — Tools + agent

**Spec.** A tool registry (`lookup_customer`, `lookup_product`,
`get_contract_price`, `check_inventory`, `check_credit`, `create_draft_order`,
`propose_order_change`, `flag_for_review`). `AGENT_MODE=offline` classifies and
drafts all 40 emails deterministically with no LLM call; `AGENT_MODE=openrouter`
uses the same tools through OpenRouter function calling.

**Acceptance.** Offline run is deterministic and covers all 40; OpenRouter path
parses tool calls.

**Verified.** Offline report stable across runs; OpenRouter client compiles and
is exercised only when `OPENROUTER_API_KEY` is set.

## T5 — Seed

**Spec.** Idempotent upsert from `assessment/data-pack/data/*.csv` and
`emails.jsonl`, keyed on natural keys.

**Acceptance.** Re-running seed does not duplicate rows.

**Verified.** Uses `onConflictDoUpdate`/`onConflictDoNothing`; guarded by
`DATABASE_URL`.

## T6 — CLI + placeholder UI

**Spec.** `npm run process` with `--dry-run` writing a JSON report to
`reports/`; a placeholder page listing the review queue.

**Acceptance.** Dry-run writes `reports/process-report.offline.dry-run.json`;
placeholder page starts.

**Verified.** Report committed; placeholder replaced by the real UI in T7+.

---

## T7 — Inbox UI (`/`)

**Spec.** Next.js App Router (server components + server actions), Tailwind.
Every email with received time, sender, subject, classification, disposition
badge (auto-draft, proposal, escalate, route, duplicate, ignore), customer and
amount when known. Disposition filters, a search box, and counters at top.

**Acceptance.** `GET /` returns 200; auto-drafted rows render with an amount and
a releaseable state.

**Verified.** `curl http://localhost:PORT/` → 200; auto-draft badge present.

## T8 — Email detail UI (`/emails/[id]`)

**Spec.** Raw email, agent trace (classification, customer, line-level price
source, warnings), extracted editable proposal (line quantities, ship-to,
requested date), and actions: Approve & release, Save edits then approve, Reject
with a reason, Mark as no-action. Edits and rejections are auditable.

**Acceptance.** `GET /emails/E012` shows the injection warning and escalation;
`GET /emails/E001` shows a Release action.

**Verified.** `curl` on both pages → 200 with the expected markers.

## T9 — Audit viewer (`/audit`)

**Spec.** Append-only trail, newest first, filterable by email and actor
(agent/system/human), showing what changed.

**Acceptance.** `GET /audit` → 200; filters by `?email=` and `?actor=`.

**Verified.** Page renders seeded agent rows + human/system rows after a release.

## T10 — Bulk release

**Spec.** From the inbox, select auto-drafted orders and release them in one
action, each producing its own audit rows.

**Acceptance.** Releasing N selected drafts emits N × (release + per-line
allocation + credit) audit rows.

**Verified.** Covered by the memory-repository test
(`bulk-releases selected drafts`).

## T11 — Server actions with approval-time re-validation

**Spec.** Every write goes through a server action that re-validates price
windows, credit, stock and order status and refuses with a clear reason if the
data changed since the proposal. No DB in tests — an in-memory repository fake.

**Acceptance.** `validateRelease` refuses on stock shortfall, credit breach and
expired-contract price change; the release path mutates nothing on refusal.

**Verified.** `tests/core/release.test.ts` + `tests/repository/memory.test.ts`.

## T12 — Supabase Auth + dev mode

**Spec.** Email/password via `@supabase/ssr`; middleware protects the app; a
sign-in page and sign-out. If Supabase env vars are missing, run open in dev
mode with a visible banner.

**Acceptance.** With no Supabase env, the app serves 200 and shows the
"auth is disabled" banner; with env, `/` redirects to `/login` when signed out.

**Verified.** `curl` in dev mode shows the banner; middleware path compiles and
is exercised when env is present.

## T13 — Deploy + CI

**Spec.** `.env.example` documenting every variable; `vercel.json` whose
`buildCommand` runs `npm run check` (lint, typecheck, tests), then
`npm run db:setup` (migrate, seed, one agent run — idempotent, skipped without
`DATABASE_URL`), then `next build`, so a red check or a broken database wiring
fails the deploy; a daily Vercel cron to `/api/keepalive` that runs `select 1`
against Supabase so the free tier does not pause.

**Acceptance.** `npm run check` passes, the Vercel build runs it before the
build, and `/api/keepalive` returns ok with a reachable database.

**Verified.** `npm run check` and `npm run build` pass locally; the keepalive
route is exercised against the local Postgres (`select 1`). GitHub Actions was
dropped deliberately: the push token used for this branch has no `workflow`
scope, and the Vercel build gate gives the same protection without it.

## T14 — Written deliverables

**Spec.** `README.md`, `docs/product-brief.md`, `docs/task-breakdown.md`,
`docs/results-and-agent-log.md` written from what actually happened (no invented
results).

**Acceptance.** Each doc exists and reflects the real 40-email outcomes and the
real build history.

**Verified.** Counts in the docs match
`reports/process-report.offline.dry-run.json`.
