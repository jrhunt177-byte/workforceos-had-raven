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
- `ANTHROPIC_API_KEY` — Anthropic API key. Without it, the app runs and all
  threads/book-case tracking work normally, but Raven's chat replies will fail closed
  with a clear error until the key is set.

Optional env: `PORT` (default 5000), `RAVEN_DATA_DIR` (default `./data`).

See `.env.example`.

## Stack

- Node.js, Express 5
- SQLite (via `better-sqlite3`), one file under `data/raven.db` — no external DB service
- Plain HTML/CSS/JS frontend, no build step — mobile-first, dark/gold theme
- Chat calls the Anthropic Messages API directly over HTTPS (same pattern used by
  Thomas in `workforceos-command-center`), no SDK dependency

## Where things live

- `server/index.mjs` — Express app and all API routes
- `server/db.mjs` — SQLite schema, connection, first-boot seed data
- `server/raven-chat.mjs` — Raven's system prompt and the Anthropic API call
- `public/` — the frontend (`index.html`, `styles.css`, `app.js`)

## Data model

- `book_cases` — one row per book/case in the pilot (status, verification, Story
  Studio link/ID, Drive folder link, next action, notes)
- `threads` — chat threads, each optionally linked to one book/case, tagged with one
  of: Book / Case Research, Story Studio Prep, Publishing Package, HAD Content,
  General Raven Ops
- `messages` — messages within a thread
- `settings` — two workspace-level links (Story Studio base URL, Drive workspace
  folder URL), editable from the Home screen

## Gotchas

- Story Studio and Google Drive are not rebuilt here — this app only stores links and
  status flags for them.
- A fresh database seeds one placeholder record, "Book 01 - Midwest Mystery Pilot",
  with no real research populated — it exists only to prove chat/case
  association/status persistence end to end.
