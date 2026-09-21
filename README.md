# Raven — PublishingOS Workspace

Dedicated workspace for Raven, the Phase-1 operator for PublishingOS / Hunt After Dark,
currently running the Midwest 12-Book Pilot.

This is a workstation, not a management platform: Raven chat in separate threads, a
lightweight book/case tracker for the 12-book pilot, and link-and-status fields for
Story Studio and Google Drive. It does not manage subcontractors, employees, or other
agents, and it does not rebuild Story Studio.

## Run & Operate

```
npm install
npm start
```

Required env:
- `DATABASE_URL` — Postgres connection string. On Replit, attaching Replit's managed
  Postgres sets this automatically. Locally, point it at any Postgres instance.
- `ANTHROPIC_API_KEY` — Anthropic API key. Without it, the app runs and all
  threads/book-case tracking work normally, but Raven's chat replies will fail closed
  with a clear error until the key is set.

Optional env: `PORT` (default 5000).

See `.env.example`.

## Stack

- Node.js, Express 5
- Postgres (via `pg`) — durable storage that survives redeploys/restarts, required
  because Replit's Autoscale deployment target gives each instance its own ephemeral
  filesystem (a local SQLite file would not persist there)
- Plain HTML/CSS/JS frontend, no build step — mobile-first, dark/gold theme
- Chat calls the Anthropic Messages API directly over HTTPS (same pattern used by
  Thomas in `workforceos-command-center`), no SDK dependency, plus Anthropic's hosted
  web-search tool so Raven verifies facts against real sources

## Where things live

- `server/index.mjs` — Express app and all API routes
- `server/db.mjs` — Postgres schema, connection pool, migrations, first-boot seed data
- `server/raven-chat.mjs` — Raven's system prompt and the Anthropic API call
- `public/` — the frontend (`index.html`, `styles.css`, `app.js`)
- `scripts/migrate-sqlite-to-postgres.mjs` — one-time data migration from the earlier
  SQLite-based version; see the comment at the top of that file for how to run it

## Data model

- `book_cases` — one row per book/case in the pilot: research fields (location,
  date/period, classification, source notes), the production pipeline status
  (DISCOVERED → ... → PUBLISHED), Chairman/Chairwoman approval (including the explicit
  lock: `chairman_locked_at` / `chairman_approved_by`, set only via the lock-approval
  endpoint, never a plain form save), factual + visual QA, John's final review, Story
  Studio link/ID, Drive folder link, next action, notes
- `threads` — chat threads, each optionally linked to one book/case, tagged with one
  of: Book / Case Research, Story Studio Prep, Publishing Package, HAD Content,
  General Raven Ops. A thread linked to a case automatically gets that case's full
  field state injected into Raven's context on every message — no re-pasting needed.
- `messages` — messages within a thread
- `story_packages` — the canonical Story Studio output per case (title, hook, summary,
  and the full structured package as JSONB: facts, narrator/visual direction, scenes,
  characters, short-form + publishing derivatives). One row per generation; the most
  recent is canonical, older ones kept as history.
- `settings` — two workspace-level links (Story Studio base URL, Drive workspace
  folder URL), editable from the Home screen
- `handoff_log` — automatic, durable milestone trail per case (status changes,
  approvals, Story Studio dispatch/receipt, QA results) — no manual copying required

## Automated pipeline handoffs

- **Locking Chairman/Chairwoman approval** (`POST /api/book-cases/:id/lock-approval`,
  distinct from the draft decision dropdown) records who approved it and when, and — if
  Approved — auto-advances status to APPROVED and fills in any still-blank (or known
  placeholder — `SEED_PLACEHOLDER_TEXT` in `server/db.mjs`) Book/Case fields from the
  case's linked chat history. Never overwrites real existing data; never invents facts
  not established in the conversation. `lockCaseApproval()` in `server/index.mjs` is the
  single shared implementation — both this HTTP route and Raven's chat tool below call it.
- **Raven can lock approval conversationally.** When a thread is linked to a case and the
  human gives an explicit, unambiguous instruction ("Approved, lock it in"), Raven calls a
  `lock_case_approval` tool (real Anthropic tool-use, `server/raven-chat.mjs`) that runs
  the exact same logic as the HTTP endpoint, tied to that conversation's case, and binds
  the thread to the case first if it wasn't already linked. She never does this from an
  ordinary positive remark, and never decides approval herself — only executes an explicit
  human instruction. Her system prompt is explicit that she can't otherwise mutate records.
- **Setting a case's status to STORY STUDIO** automatically calls Story Studio's own
  `POST /api/ai/generate-story-project` (`server/story-studio.mjs`), stores the full
  returned package, and advances status to STORY COMPLETE. Story Studio itself keeps no
  server-side project record — this is what makes the package durable. A manual
  Generate/Regenerate button on the Book detail page covers retries. On a successful
  dispatch, `spreadStoryPackageIntoBookCase()` also reflects the package's title and
  refined synopsis into `working_title`/`story_brief` on the Book Details record itself
  (title only if blank/placeholder; synopsis always refreshed, since arriving here means
  the case just cleared an approved stage that produces a more authoritative one).
- **Approving a book auto-starts research on the next one** (`maybeSeedNextBook()`) —
  the 12-book queue doesn't wait on one book at a time. If the next numbered slot is
  still empty and has no research thread yet, locking Approved creates one, sends Raven
  a real kickoff prompt (grounded in her normal web-search charter — never scripted
  placeholder content), and advances that slot to AWAITING APPROVAL once she proposes a
  candidate. Idempotent: a slot that already has a thread never gets a second one, so
  re-approving/re-locking a book is always safe to repeat.
- Every step above writes to `handoff_log` automatically, including why a step was
  skipped (no Story Studio URL configured, no brief content yet, upstream error, etc).

## Gotchas

- Story Studio and Google Drive are not rebuilt here — Raven calls Story Studio's
  existing generation endpoint directly and only stores links/status flags for Drive.
- Story Studio's endpoint has no API-key/auth scheme of its own (verified by reading its
  code) — it's only reachable because both apps are effectively internal to this
  workspace; nothing new to provision, but don't expose it further.
- A fresh database seeds one placeholder record, "Book 01 - Midwest Mystery Pilot",
  with no real research populated — it exists only to prove chat/case
  association/status persistence end to end.
