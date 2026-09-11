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
    status TEXT NOT NULL DEFAULT 'Idea',
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
    ) VALUES (?, 1, 'Book 01 - Midwest Mystery Pilot', '', '', 'Idea', 0,
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
  ) VALUES (?, ?, '', '', '', 'Idea', 0, '', '', '', '', 0, 0, '', '', '', ?, ?)
`)
for (let n = 1; n <= 12; n++) {
  if (!takenNumbers.has(n)) {
    const ts = new Date().toISOString()
    insertSlot.run(randomId(), n, ts, ts)
  }
}

export default db
