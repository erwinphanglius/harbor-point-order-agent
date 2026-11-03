# Results and agent log

All counts below are read directly from
`reports/process-report.offline.dry-run.json` (the deterministic offline run
over all 40 emails, no LLM).

## How the system handled the 40 emails

| Outcome | Count | Emails |
|---|---|---|
| Auto-draft | 12 (14 draft orders) | E001, E002, E003, E005, E011, E015, E031, E034, E037, E038, E039, E040 |
| Propose change | 2 | E004 (edit to OPEN SO-24051), E017 (cancel SOP-1182) |
| Escalate | 20 | see below |
| Route | 3 | E009 (quote), E027 (complaint), E030 (invoice question) |
| Duplicate | 1 | E016 (resend of E015's PO SSL-7781) |
| Ignore | 2 | E028 (out-of-office), E029 (SEO spam) |

Escalations, by reason:

- **E006** credit limit would be breached · **E007** credit hold · **E008**
  out of stock (clear cups, 0 available) · **E010** "same as last time" not
  parseable · **E012** prompt-injection attempt · **E013** unknown contact ·
  **E014** unknown customer · **E018** edit to a SHIPPED order · **E019** /
  **E020** discontinued (propose HPS-1001 / HPS-1307) · **E021** unknown SKU
  HPS-1035 · **E022** no quantities · **E023** attachment mentioned but absent ·
  **E024** expired contract price claim · **E025** no-record price claim ·
  **E026** ambiguous unit ("boxes") / ambiguous product · **E032** requested
  date in the past · **E033** insufficient stock (disinfectant) · **E035**
  ambiguous "gloves" · **E036** "the usual" not resolvable.

Notable correct calls: E003 applied three contract prices and fell back to list
for the rest; E005 split into three draft orders (one per club) with the right
ship-to each; E011 (Spanish) resolved to 55-gal liners, nitrile-large gloves and
cling film; E034 honoured "skip the towels" and dropped the multifold line;
E016 was deduplicated against E015.

## Where it gets things wrong / is weak

- **Offline extractor limits.** The rule-based parser handles the formats that
  appear in this inbox, but it is brittle to novel phrasing. "Same as last
  time" (E010) and "the usual" (E036) are escalated instead of resolved through
  order history — an agent with a *lookup last order* tool could draft these.
- **Ambiguity → conservative escalate.** Bare "gloves" (E035) and "boxes" vs
  "cases" (E026) escalate. That is safe but adds human load that a smarter
  matcher (or a clarifying email) would avoid.
- **Dates.** Only literal "Month DD" dates are parsed ("Thursday delivery" and
  "next Tuesday" are left null; E032's past-date flag depends on "October 30"
  being present in the text). Weekday-only and relative dates are not resolved.
- **Spanish.** Handled by a small lexicon that covers the single Spanish email;
  a differently-phrased Spanish order would safely escalate rather than
  mis-resolve.
- **Multi ship-to splitting.** Only the "Label:" prefix pattern is recognised
  (E005). Other multi-address phrasings would not be split into separate orders.
- **Price-claim refusals.** E024/E025 escalate even though the items are
  otherwise clean, because a customer-asserted price with no valid record can't
  be honoured safely. Correct, but the human must confirm the price.
- **Credit model.** Drafts reserve nothing, so a batch of releases runs against
  a moving balance — a human releasing many drafts must watch the total.
- **Discontinued.** E019/E020 escalate with a suggested successor rather than
  auto-substituting; substitution always needs confirmation (by design).

## Where the coding agent went wrong, and how it was corrected

Phase 1–2 (core):

1. **CSV parser dropped quoted fields.** Product names contain commas, so
   `status`/`list_price` columns shifted and discontinued products looked
   "found", surfacing as spurious `INSUFFICIENT_STOCK`. Caught by a debug dump;
   fixed by rewriting the parser to honour quotes.
2. **Spanish "55 galones"** was split into a phantom quantity item. Fixed by
   adding Spanish units to the measurement list plus a small translation map.
3. **"Lids for the hot cups" (E040)** matched the hot-cup product, not the lid.
   Fixed with an unambiguous short-circuit (soup→soup cup, lids→hot-cup lid).
4. **"Skip the towels" (E034)** was ignored and the towels were drafted. Fixed
   by extracting exclusion phrases and filtering matching items.
5. **Credit check ran after drafts were built**, so an escalated email could
   still carry a draft. Reordered to check credit before building drafts.
6. **Duplicate detection** treated any mention of an existing PO as a duplicate,
   mis-labelling the change (E004) and the return (E018). Scoped to same-batch
   PO reuse + resend markers.

Phase 3–5 (UI/deploy):

7. **Next.js build failed** on the core modules' `.js` import specifiers. Fixed
   with a webpack `extensionAlias` in `next.config.mjs` — no core rewrite.
8. **`@supabase/ssr` cookie callbacks** were implicitly `any`. Fixed with
   explicit parameter types.
9. **Login form action** returned a value where React expects `void` (and a
   server action can't render client error state). Fixed by making sign-in a
   client form using `createBrowserClient`.
10. **Memory repository** returned an undeclared `orderValue` property; fixed
    the return type.

Phase 6 (persistence) — a real review finding:

11. **The UI served memory while the schema was unused.** `src/repository/` only
    had `memory.ts`, so a deployed app served an in-memory store: approvals and
    releases did not persist across serverless instances, and the Drizzle schema
    (`sales_orders`, `audit_log`, …) was never read or written. This was a real
    defect — the persistence layer existed only as a seed script. Fix: added
    `src/repository/pg.ts`, a Drizzle implementation of the same async
    `Repository` interface, made the interface async, routed pages/actions/CLI
    through one factory (`src/lib/repo.ts`) that picks Postgres when
    `DATABASE_URL` is set, extended the schema with the columns the repository
    genuinely needed (`sales_order_lines.description`/`price_source`,
    `sales_orders.rejected_reason`, `emails.customer_id`/`issues_json`/
    `notes_json`/`change_proposal_json`/`duplicate_of_email_id`/`reject_reason`,
    `audit_log.dedupe_key` + a `(so_number, line_no)` unique index) and
    regenerated the migration. `npm run process` now persists idempotently;
    `npm run db:migrate` applies migrations; `npm run verify:db` proves the whole
    path (migrate → seed → process → assertions → release E001 → fresh-connection
    re-read → re-process with no duplicates) against a real database.
12. **`verify:db` crashed on `DATABASE_URL` first time** because `seed.ts` still
    ran its `main()` on import (an unguarded top-level side effect). Fixed by
    guarding the CLI entrypoint behind an `import.meta` main-module check.
13. **Local Postgres (PGlite) resets connections** when a `pg.Pool` opens more
    than its `max_connections` (default 1). Fixed by pinning the pool to
    `max: 1` and retrying the fresh-connection re-read, so the same code works
    against PGlite, a single-slot local server and `postgres:16` in CI.

Every one of these was caught by either a test, `tsc`, the production build, or
`npm run verify:db`, and corrected before the commit.
