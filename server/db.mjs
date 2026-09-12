import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.RAVEN_DATA_DIR || path.join(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'raven.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS book_cases (
    id TEXT PRIMARY KEY,
    number INTEGER,
    working_title TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    date_period TEXT NOT NULL DEFAULT '',
    case_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DISCOVERED',
    research_status TEXT NOT NULL DEFAULT 'Not Started',
    research_complete INTEGER NOT NULL DEFAULT 0,
    classification TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT '',
    verification_date TEXT NOT NULL DEFAULT '',
    source_notes TEXT NOT NULL DEFAULT '',
    story_brief TEXT NOT NULL DEFAULT '',
    story_studio_url TEXT NOT NULL DEFAULT '',
    story_studio_project_id TEXT NOT NULL DEFAULT '',
    story_studio_sent INTEGER NOT NULL DEFAULT 0,
    story_studio_approved INTEGER NOT NULL DEFAULT 0,
    drive_folder_url TEXT NOT NULL DEFAULT '',
    next_action TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    tag TEXT NOT NULL DEFAULT 'General Raven Ops',
    book_case_id TEXT REFERENCES book_cases(id) ON DELETE SET NULL,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'raven')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS handoff_log (
    id TEXT PRIMARY KEY,
    book_case_id TEXT NOT NULL REFERENCES book_cases(id) ON DELETE CASCADE,
    milestone TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    drive_synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_handoff_log_case ON handoff_log(book_case_id, created_at);
`)

// Migrate book_cases created before the research-workflow fields existed: SQLite's
// CREATE TABLE IF NOT EXISTS leaves an already-created table's columns untouched, so
// add any that are missing rather than requiring a fresh database file.
const NEW_BOOK_CASE_COLUMNS = [
  ['location', "TEXT NOT NULL DEFAULT ''"],
  ['date_period', "TEXT NOT NULL DEFAULT ''"],
  ['research_status', "TEXT NOT NULL DEFAULT 'Not Started'"],
  ['classification', "TEXT NOT NULL DEFAULT ''"],
  ['source_notes', "TEXT NOT NULL DEFAULT ''"],
  ['story_brief', "TEXT NOT NULL DEFAULT ''"],
  // Production-pipeline gates (Architect bridge, Issue #2): Chairman/Chairwoman
  // approval, pre-final QA (factual + visual), and John's final publication review.
  ['chairman_decision', "TEXT NOT NULL DEFAULT ''"],
  ['chairman_notes', "TEXT NOT NULL DEFAULT ''"],
  ['qa_factual_status', "TEXT NOT NULL DEFAULT 'Not Started'"],
  ['qa_factual_notes', "TEXT NOT NULL DEFAULT ''"],
  ['qa_visual_status', "TEXT NOT NULL DEFAULT 'Not Started'"],
  ['qa_visual_notes', "TEXT NOT NULL DEFAULT ''"],
  ['john_review_decision', "TEXT NOT NULL DEFAULT ''"],
  ['john_review_notes', "TEXT NOT NULL DEFAULT ''"],
]
const existingColumns = new Set(db.prepare('PRAGMA table_info(book_cases)').all().map((c) => c.name))
for (const [name, definition] of NEW_BOOK_CASE_COLUMNS) {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE book_cases ADD COLUMN ${name} ${definition}`)
  }
}

function randomId() {
  return 'seed-' + Math.random().toString(36).slice(2, 10)
}

// The Architect bridge (Issue #2) supersedes the old status vocabulary with a full
// production pipeline. Remap any existing rows so nothing is stuck on a retired value.
const STATUS_MIGRATION = {
  'Idea': 'DISCOVERED',
  'Researching': 'RESEARCH',
  'Verified': 'FACT VERIFIED',
  'Story Studio': 'STORY STUDIO',
  'Story Approved': 'STORY COMPLETE',
  'Artwork': 'BOOK PRODUCTION',
  'Layout': 'BOOK PRODUCTION',
  'QA': 'QA',
  'KDP Ready': 'APPROVED TO PUBLISH',
  'Published': 'PUBLISHED',
}
const remapStatus = db.prepare('UPDATE book_cases SET status = ? WHERE status = ?')
for (const [oldStatus, newStatus] of Object.entries(STATUS_MIGRATION)) {
  remapStatus.run(newStatus, oldStatus)
}

// Seed defaults once, on first boot only.
const seedTs = new Date().toISOString()

const settingsCount = db.prepare('SELECT COUNT(*) AS n FROM settings').get().n
if (settingsCount === 0) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
    'storyStudioUrl', 'https://prompt-content-engine--jrhunt177.replit.app'
  )
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('driveWorkspaceUrl', '')
}

const bookCaseCount = db.prepare('SELECT COUNT(*) AS n FROM book_cases').get().n
if (bookCaseCount === 0) {
  db.prepare(`
    INSERT INTO book_cases (
      id, number, working_title, region, case_name, status, research_complete,
      verification_status, verification_date, story_studio_url, story_studio_project_id,
      story_studio_sent, story_studio_approved, drive_folder_url, next_action, notes,
      created_at, updated_at
    ) VALUES (?, 1, 'Book 01 - Midwest Mystery Pilot', '', '', 'DISCOVERED', 0,
      '', '', '', '',
      0, 0, '', 'Placeholder/test record — begin research when ready.',
      'Placeholder/test record only. Not populated with real research.', ?, ?)
  `).run(randomId(), seedTs, seedTs)
}

// The pilot is fixed at 12 books. Fill in any missing slot numbers 1-12 as empty,
// unresearched placeholders — never inventing case content — so the Books area always
// shows all 12 rather than however many records happen to exist.
const takenNumbers = new Set(db.prepare('SELECT number FROM book_cases WHERE number IS NOT NULL').all().map((r) => r.number))
const insertSlot = db.prepare(`
  INSERT INTO book_cases (
    id, number, working_title, region, case_name, status, research_complete,
    verification_status, verification_date, story_studio_url, story_studio_project_id,
    story_studio_sent, story_studio_approved, drive_folder_url, next_action, notes,
    created_at, updated_at
  ) VALUES (?, ?, '', '', '', 'DISCOVERED', 0, '', '', '', '', 0, 0, '', '', '', ?, ?)
`)
for (let n = 1; n <= 12; n++) {
  if (!takenNumbers.has(n)) {
    const ts = new Date().toISOString()
    insertSlot.run(randomId(), n, ts, ts)
  }
}

const insertHandoffLog = db.prepare(`
  INSERT INTO handoff_log (id, book_case_id, milestone, detail, drive_synced, created_at)
  VALUES (@id, @bookCaseId, @milestone, @detail, 0, @createdAt)
`)

// Durable, automatic milestone trail per case — the interim shared-state layer until
// real Google Drive API writes are wired up (needs OAuth credentials only John can
// create). drive_synced stays 0 until a real Drive write lands; nothing here depends
// on John copying anything manually.
export function logHandoff(bookCaseId, milestone, detail = '') {
  insertHandoffLog.run({
    id: 'log-' + Math.random().toString(36).slice(2, 10),
    bookCaseId,
    milestone,
    detail,
    createdAt: new Date().toISOString(),
  })
}

export function getHandoffLog(bookCaseId) {
  return db.prepare('SELECT * FROM handoff_log WHERE book_case_id = ? ORDER BY created_at ASC').all(bookCaseId)
}

export default db
