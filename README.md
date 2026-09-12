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
  (DISCOVERED → ... → PUBLISHED), Chairman/Chairwoman approval, factual + visual QA,
  John's final review, Story Studio link/ID, Drive folder link, next action, notes
- `threads` — chat threads, each optionally linked to one book/case, tagged with one
  of: Book / Case Research, Story Studio Prep, Publishing Package, HAD Content,
  General Raven Ops
- `messages` — messages within a thread
- `settings` — two workspace-level links (Story Studio base URL, Drive workspace
  folder URL), editable from the Home screen
- `handoff_log` — automatic, durable milestone trail per case (status changes,
  approvals, Story Studio dispatch/receipt, QA results) — no manual copying required

## Gotchas

- Story Studio and Google Drive are not rebuilt here — this app only stores links and
  status flags for them.
- A fresh database seeds one placeholder record, "Book 01 - Midwest Mystery Pilot",
  with no real research populated — it exists only to prove chat/case
  association/status persistence end to end.
