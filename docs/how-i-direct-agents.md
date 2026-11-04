# How I direct the agents

The brief says how I direct and correct coding agents is a large part of what
gets assessed, so this is the honest version of it — not a success story, the
loop I actually ran, including the parts that were slow.

The build went through Hermes, the harness I use to orchestrate several coding
agents behind one interface: Claude Code, Codex and OpenCode are interchangeable
behind it, so the model doing the work is a setting rather than a rewrite. For
this repo it was OpenCode Go running `glm-5.3-flash` — the same model the app
uses at runtime. Every task below is a branch, a session, a plan, and a PR.

## The loop

1. **Write the task as a contract, not a request.** "Add urgency" is not a task.
   "Urgency is the model's call: it returns today/shortly/none and the sentence it
   based it on; rules may not overwrite it; a regression test proves it" is.
2. **Plan first, and make the plan checkable.** The agent's first output is a plan
   that starts with `Finished when:` — three or four observable conditions. If it
   cannot name them, the task is not ready and I rewrite it.
3. **One branch, one session, one PR.** The branch is the unit of context: the
   agent keeps the plan, the failures and the decisions for that task and nothing
   else. A follow-up goes back to the same branch, never a fresh session, so the
   context survives and it does not re-litigate settled decisions.
4. **Build, then check.** `lint`, `typecheck`, `test`, `build`. Green is the floor,
   not the finish line: I also read the diff and look at the observable thing —
   the rendered page, the counted rows, the refused release.
5. **Correct with evidence, then pin it.** Every correction names the evidence
   (an ID, a count, a failing expectation), the cause, and the test that keeps it
   fixed.

## The rules I give once

Stated at the start, applied to every task, not repeated per prompt:

- One branch per task, cut from `origin/HEAD`. Never touch `main`, never push.
- Core logic in `src/core` as pure functions — no DB, no network, no clock.
- Types first. A test for every rule added or changed. A bug fix starts with a
  failing test.
- Server actions re-validate at release. The agent never releases.
- Commit messages in the repo's style, never mentioning AI or tooling.
- Report what was actually run. "Should work" is not a status.

Those rules are the cheap half. The expensive half is knowing which claim to
distrust.

## What I check myself, every time

- **Counts.** 40 emails in, 12 drafts, 20 escalations, 2 auto-ignored. If the
  number disagrees with the report, the code is wrong — that is how the
  "credit checked after the draft was built" bug surfaced: an escalated email was
  carrying a draft nobody would release.
- **The rendered page, not the component.** "It builds" hides a page that returns
  500 on first render; that happened, and the fix was clearing a stale build
  cache, not code.
- **The audit trail as the story of one order.** If SO-24062 cannot be followed
  from draft to release in the trail, something is not being recorded.
- **The exact wording of user-facing copy.** A button labelled *Reject* next to a
  *Close* button is two names for one action, and it confuses the person using it
  more than any bug does.

## Corrections that mattered

Each one is in the appendix of `docs/task-breakdown.md` with the prompt as typed.

- **Quoted CSV fields.** Product names contain commas, so `status` and `price`
  shifted and discontinued products looked in stock — a rule passing on broken
  data, which is the worst kind of green. Told it to rewrite the parser and add a
  test for the exact product that broke.
- **"55 galones".** An order in Spanish produced a phantom quantity line. Told it
  the measurement list needs Spanish units and a small translation map — it is an
  order, not an unknown product.
- **Exclusions.** E034 says "skip the towels" and we drafted towels. Extraction
  had no notion of exclusion; added it, with the email as the test.
- **Order of checks.** Credit was checked after drafts were built, so an escalated
  email could still carry one. Moved the check before `buildDrafts`.
- **Urgency overwritten.** The model said `soon`, the row said `none`: the rules
  engine was replacing the model's judgement on rule overrides, which is precisely
  what the design forbids. One-line fix, plus a regression test on the email where
  a rule overrides the disposition.
- **Phantom edits.** "Approve with edits" recorded an edit even when nothing had
  been edited. The fix was to compare the draft against the submitted values and
  fall through to a plain release.

Two things the agent did that I would not have caught by reading the diff: the
demo UI served an in-memory repository while the Postgres schema sat unused (so
approvals vanished between serverless instances), and the audit tabs re-fetched
300 rows on every tab click because the tab was a link. Both were found by using
the app, not by reviewing it.

## What I would change next time

- **A browser click-through in the loop.** My verification was server-rendered
  HTML and direct repository calls; the parts I never actually clicked are the
  parts I am least sure of. A headless browser step after `build` would close that
  gap.
- **Screenshots in the PR.** For UI tasks, "the page renders" should come with a
  picture, not a description.
- **A second agent as reviewer.** I reviewed; a fresh agent told to find what is
  wrong with the diff would have caught the in-memory repository earlier.

That is the setup: one interface, several agents, a contract per task, and the
numbers as the referee.
